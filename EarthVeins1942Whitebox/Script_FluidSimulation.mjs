const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const LerpValue = (a, b, amount) => a + (b - a) * amount;

export class TunnelFluidSimulation {
  constructor(options = {}) {
    this.columns = Math.max(48, Math.floor(options.columns || 152));
    this.rows = Math.max(24, Math.floor(options.rows || 58));
    this.count = this.columns * this.rows;
    this.worldMinimum = options.worldMinimum ?? -11;
    this.worldMaximum = options.worldMaximum ?? 11;
    this.velocityX = new Float32Array(this.count);
    this.velocityY = new Float32Array(this.count);
    this.previousVelocityX = new Float32Array(this.count);
    this.previousVelocityY = new Float32Array(this.count);
    this.pressure = new Float32Array(this.count);
    this.divergence = new Float32Array(this.count);
    this.curl = new Float32Array(this.count);
    this.smoke = new Float32Array(this.count);
    this.previousSmoke = new Float32Array(this.count);
    this.water = new Float32Array(this.count);
    this.previousWater = new Float32Array(this.count);
    this.tracer = new Float32Array(this.count);
    this.previousTracer = new Float32Array(this.count);
    this.solid = new Uint8Array(this.count);
    this.signedDistance = new Float32Array(this.count);
    this.renderPixels = new Uint8ClampedArray(this.count * 4);
    this.structures = [null, null, null];
    this.activeStructures = [false, false, false];
    this.ventilation = 0;
    this.statistics = { smokeMass: 0, waterMass: 0, tracerMass: 0, maximumSmoke: 0, maximumWater: 0 };
    this.RebuildBoundary();
  }

  Index(column, row) { return row * this.columns + column; }

  WorldToColumn(worldX) {
    return (Clamp(worldX, this.worldMinimum, this.worldMaximum) - this.worldMinimum)
      / (this.worldMaximum - this.worldMinimum) * (this.columns - 1);
  }

  NormalizedToRow(normalizedY) {
    return Clamp((normalizedY + 1) * .5 * (this.rows - 1), 0, this.rows - 1);
  }

  ColumnToWorld(column) {
    return this.worldMinimum + column / (this.columns - 1) * (this.worldMaximum - this.worldMinimum);
  }

  RowToNormalized(row) { return row / (this.rows - 1) * 2 - 1; }

  SetStructures(structures = [], activeStructures = [], ventilation = 0) {
    const nextStructures = [0, 1, 2].map((index) => structures[index] || null);
    const nextActive = [0, 1, 2].map((index) => Boolean(activeStructures[index]));
    const changed = nextStructures.some((value, index) => value !== this.structures[index]
      || nextActive[index] !== this.activeStructures[index]);
    this.structures = nextStructures;
    this.activeStructures = nextActive;
    this.ventilation = Math.max(0, Number(ventilation) || 0);
    if (changed) this.RebuildBoundary();
  }

  RebuildBoundary() {
    const { columns, rows, solid } = this;
    solid.fill(0);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = this.Index(column, row);
        if (column < 2 || column >= columns - 2 || row < 2 || row >= rows - 2) solid[index] = 1;
      }
    }

    const slotWorldXs = [-7, 0, 7];
    this.structures.forEach((structure, slotIndex) => {
      if (!structure) return;
      const centerColumn = Math.round(this.WorldToColumn(slotWorldXs[slotIndex]));
      if (structure === "flipGate" && this.activeStructures[slotIndex]) {
        for (let column = centerColumn - 1; column <= centerColumn + 1; column += 1) {
          for (let row = 3; row < rows - 3; row += 1) solid[this.Index(column, row)] = 1;
        }
      } else if (structure === "floodGate") {
        const topRow = Math.round(this.NormalizedToRow(this.activeStructures[slotIndex] ? -.08 : .48));
        for (let column = centerColumn - 2; column <= centerColumn + 2; column += 1) {
          for (let row = topRow; row < rows - 2; row += 1) solid[this.Index(column, row)] = 1;
        }
      } else if (structure === "smokeBaffle") {
        const reach = this.activeStructures[slotIndex] ? 8 : 5;
        for (let offset = -reach; offset <= reach; offset += 1) {
          const column = centerColumn + offset;
          const bottomRow = Math.round(this.NormalizedToRow(-.5 + Math.abs(offset) * .045));
          for (let row = 2; row <= bottomRow; row += 1) solid[this.Index(column, row)] = 1;
        }
      }
    });
    this.BuildSignedDistanceField();
    this.ApplyBoundary(this.velocityX, this.velocityY);
  }

  BuildSignedDistanceField() {
    const { columns, rows, solid, signedDistance } = this;
    const far = columns + rows;
    for (let index = 0; index < this.count; index += 1) signedDistance[index] = solid[index] ? 0 : far;
    const diagonal = Math.SQRT2;
    for (let row = 1; row < rows - 1; row += 1) {
      for (let column = 1; column < columns - 1; column += 1) {
        const index = this.Index(column, row);
        if (solid[index]) continue;
        signedDistance[index] = Math.min(signedDistance[index],
          signedDistance[this.Index(column - 1, row)] + 1,
          signedDistance[this.Index(column, row - 1)] + 1,
          signedDistance[this.Index(column - 1, row - 1)] + diagonal,
          signedDistance[this.Index(column + 1, row - 1)] + diagonal);
      }
    }
    for (let row = rows - 2; row >= 1; row -= 1) {
      for (let column = columns - 2; column >= 1; column -= 1) {
        const index = this.Index(column, row);
        if (solid[index]) continue;
        signedDistance[index] = Math.min(signedDistance[index],
          signedDistance[this.Index(column + 1, row)] + 1,
          signedDistance[this.Index(column, row + 1)] + 1,
          signedDistance[this.Index(column + 1, row + 1)] + diagonal,
          signedDistance[this.Index(column - 1, row + 1)] + diagonal);
      }
    }
    for (let index = 0; index < this.count; index += 1) {
      if (solid[index]) signedDistance[index] = -1;
    }
  }

  Inject(kind, worldX, normalizedY, amount, radius = .35, velocityX = 0, velocityY = 0) {
    const field = kind === "water" ? this.water : kind === "tracer" ? this.tracer : this.smoke;
    const centerColumn = this.WorldToColumn(worldX);
    const centerRow = this.NormalizedToRow(normalizedY);
    const radiusColumns = Math.max(2, radius / (this.worldMaximum - this.worldMinimum) * this.columns * 2);
    const radiusRows = Math.max(2, radius * this.rows * .42);
    const minimumColumn = Math.max(2, Math.floor(centerColumn - radiusColumns));
    const maximumColumn = Math.min(this.columns - 3, Math.ceil(centerColumn + radiusColumns));
    const minimumRow = Math.max(2, Math.floor(centerRow - radiusRows));
    const maximumRow = Math.min(this.rows - 3, Math.ceil(centerRow + radiusRows));
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) continue;
        const dx = (column - centerColumn) / radiusColumns;
        const dy = (row - centerRow) / radiusRows;
        const falloff = Math.max(0, 1 - dx * dx - dy * dy);
        if (falloff <= 0) continue;
        field[index] = Clamp(field[index] + amount * falloff, 0, 1);
        this.velocityX[index] += velocityX * falloff;
        this.velocityY[index] += velocityY * falloff;
      }
    }
  }

  Step(deltaSeconds) {
    const steps = Math.max(1, Math.ceil(Math.min(.06, deltaSeconds) / .024));
    const step = Math.min(.06, deltaSeconds) / steps;
    for (let iteration = 0; iteration < steps; iteration += 1) this.Substep(step);
    this.MeasureStatistics();
  }

  Substep(deltaSeconds) {
    this.ApplyForces(deltaSeconds);
    this.AddVorticity(deltaSeconds);
    this.ProjectVelocity(11);
    this.previousVelocityX.set(this.velocityX);
    this.previousVelocityY.set(this.velocityY);
    this.Advect(this.velocityX, this.previousVelocityX, this.previousVelocityX, this.previousVelocityY, deltaSeconds, .78);
    this.Advect(this.velocityY, this.previousVelocityY, this.previousVelocityX, this.previousVelocityY, deltaSeconds, .78);
    this.ApplyBoundary(this.velocityX, this.velocityY);
    this.ProjectVelocity(9);

    this.previousSmoke.set(this.smoke);
    this.previousWater.set(this.water);
    this.previousTracer.set(this.tracer);
    this.Advect(this.smoke, this.previousSmoke, this.velocityX, this.velocityY, deltaSeconds, .92);
    this.Advect(this.water, this.previousWater, this.velocityX, this.velocityY, deltaSeconds, .98);
    this.Advect(this.tracer, this.previousTracer, this.velocityX, this.velocityY, deltaSeconds, .9);
    this.SettleWater(deltaSeconds);
    this.ApplyVentilationSink(deltaSeconds);

    const smokeDecay = Math.exp(-deltaSeconds * .035);
    const tracerDecay = Math.exp(-deltaSeconds * .22);
    for (let index = 0; index < this.count; index += 1) {
      if (this.solid[index]) {
        this.smoke[index] = 0; this.water[index] = 0; this.tracer[index] = 0;
        continue;
      }
      this.smoke[index] = Clamp(this.smoke[index] * smokeDecay * (1 - this.water[index] * .08), 0, 1);
      this.tracer[index] = Clamp(this.tracer[index] * tracerDecay, 0, 1);
      this.water[index] = Clamp(this.water[index], 0, 1);
    }
  }

  ApplyForces(deltaSeconds) {
    const exhaustColumn = this.WorldToColumn(4.6);
    for (let row = 2; row < this.rows - 2; row += 1) {
      for (let column = 2; column < this.columns - 2; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) continue;
        this.velocityY[index] += (this.water[index] * 8.4 - this.smoke[index] * 2.45) * deltaSeconds;
        if (this.ventilation > 0) {
          const direction = Math.sign(exhaustColumn - column);
          const proximity = Math.max(.2, 1 - Math.abs(exhaustColumn - column) / this.columns);
          this.velocityX[index] += direction * this.ventilation * .95 * proximity * deltaSeconds;
          this.velocityY[index] -= this.smoke[index] * this.ventilation * .18 * deltaSeconds;
        }
      }
    }
  }

  AddVorticity(deltaSeconds) {
    const { columns, rows, curl } = this;
    curl.fill(0);
    for (let row = 2; row < rows - 2; row += 1) {
      for (let column = 2; column < columns - 2; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) continue;
        const verticalX = (this.velocityY[this.Index(column + 1, row)] - this.velocityY[this.Index(column - 1, row)]) * .5;
        const horizontalY = (this.velocityX[this.Index(column, row + 1)] - this.velocityX[this.Index(column, row - 1)]) * .5;
        curl[index] = verticalX - horizontalY;
      }
    }
    for (let row = 3; row < rows - 3; row += 1) {
      for (let column = 3; column < columns - 3; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) continue;
        let normalX = (Math.abs(curl[this.Index(column + 1, row)]) - Math.abs(curl[this.Index(column - 1, row)])) * .5;
        let normalY = (Math.abs(curl[this.Index(column, row + 1)]) - Math.abs(curl[this.Index(column, row - 1)])) * .5;
        const length = Math.hypot(normalX, normalY) + .0001;
        normalX /= length; normalY /= length;
        const force = curl[index] * 1.75 * deltaSeconds;
        this.velocityX[index] += normalY * force;
        this.velocityY[index] -= normalX * force;
      }
    }
  }

  ProjectVelocity(iterations) {
    const { columns, rows, pressure, divergence, solid } = this;
    pressure.fill(0);
    divergence.fill(0);
    for (let row = 2; row < rows - 2; row += 1) {
      for (let column = 2; column < columns - 2; column += 1) {
        const index = this.Index(column, row);
        if (solid[index]) continue;
        const right = solid[this.Index(column + 1, row)] ? 0 : this.velocityX[this.Index(column + 1, row)];
        const left = solid[this.Index(column - 1, row)] ? 0 : this.velocityX[this.Index(column - 1, row)];
        const bottom = solid[this.Index(column, row + 1)] ? 0 : this.velocityY[this.Index(column, row + 1)];
        const top = solid[this.Index(column, row - 1)] ? 0 : this.velocityY[this.Index(column, row - 1)];
        divergence[index] = -.5 * (right - left + bottom - top);
      }
    }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let row = 2; row < rows - 2; row += 1) {
        for (let column = 2; column < columns - 2; column += 1) {
          const index = this.Index(column, row);
          if (solid[index]) continue;
          let total = divergence[index];
          let divisor = 0;
          for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const neighbor = this.Index(column + offsetX, row + offsetY);
            if (!solid[neighbor]) { total += pressure[neighbor]; divisor += 1; }
          }
          pressure[index] = total / Math.max(1, divisor);
        }
      }
    }
    for (let row = 2; row < rows - 2; row += 1) {
      for (let column = 2; column < columns - 2; column += 1) {
        const index = this.Index(column, row);
        if (solid[index]) continue;
        const left = solid[this.Index(column - 1, row)] ? pressure[index] : pressure[this.Index(column - 1, row)];
        const right = solid[this.Index(column + 1, row)] ? pressure[index] : pressure[this.Index(column + 1, row)];
        const top = solid[this.Index(column, row - 1)] ? pressure[index] : pressure[this.Index(column, row - 1)];
        const bottom = solid[this.Index(column, row + 1)] ? pressure[index] : pressure[this.Index(column, row + 1)];
        this.velocityX[index] -= .5 * (right - left);
        this.velocityY[index] -= .5 * (bottom - top);
      }
    }
    this.ApplyBoundary(this.velocityX, this.velocityY);
  }

  ApplyBoundary(horizontal, vertical) {
    for (let row = 1; row < this.rows - 1; row += 1) {
      for (let column = 1; column < this.columns - 1; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) { horizontal[index] = 0; vertical[index] = 0; continue; }
        if (this.solid[this.Index(column - 1, row)] || this.solid[this.Index(column + 1, row)]) horizontal[index] *= -.08;
        if (this.solid[this.Index(column, row - 1)] || this.solid[this.Index(column, row + 1)]) vertical[index] *= -.08;
        horizontal[index] = Clamp(horizontal[index], -9, 9);
        vertical[index] = Clamp(vertical[index], -9, 9);
      }
    }
  }

  Advect(target, source, horizontal, vertical, deltaSeconds, dissipation) {
    const attenuation = Math.pow(dissipation, deltaSeconds);
    for (let row = 2; row < this.rows - 2; row += 1) {
      for (let column = 2; column < this.columns - 2; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) { target[index] = 0; continue; }
        const sourceColumn = Clamp(column - horizontal[index] * deltaSeconds, 1.5, this.columns - 2.5);
        const sourceRow = Clamp(row - vertical[index] * deltaSeconds, 1.5, this.rows - 2.5);
        target[index] = this.SampleGrid(source, sourceColumn, sourceRow) * attenuation;
      }
    }
  }

  SampleGrid(field, column, row) {
    const column0 = Math.floor(column);
    const row0 = Math.floor(row);
    const column1 = Math.min(this.columns - 1, column0 + 1);
    const row1 = Math.min(this.rows - 1, row0 + 1);
    const mixX = column - column0;
    const mixY = row - row0;
    const top = LerpValue(field[this.Index(column0, row0)], field[this.Index(column1, row0)], mixX);
    const bottom = LerpValue(field[this.Index(column0, row1)], field[this.Index(column1, row1)], mixX);
    return LerpValue(top, bottom, mixY);
  }

  SettleWater(deltaSeconds) {
    const fallFraction = Math.min(.48, deltaSeconds * 7.5);
    for (let row = this.rows - 3; row >= 2; row -= 1) {
      for (let column = 2; column < this.columns - 2; column += 1) {
        const index = this.Index(column, row);
        const below = this.Index(column, row + 1);
        if (this.solid[index] || this.solid[below] || this.water[index] <= .001) continue;
        const transfer = Math.min(this.water[index] * fallFraction, Math.max(0, 1 - this.water[below]));
        this.water[index] -= transfer;
        this.water[below] += transfer;
      }
    }
    for (let row = this.rows - 3; row >= 3; row -= 1) {
      for (let column = 3; column < this.columns - 3; column += 1) {
        const index = this.Index(column, row);
        if (this.solid[index] || this.water[index] < .35) continue;
        const direction = this.water[this.Index(column - 1, row)] < this.water[this.Index(column + 1, row)] ? -1 : 1;
        const neighbor = this.Index(column + direction, row);
        if (this.solid[neighbor]) continue;
        const difference = this.water[index] - this.water[neighbor];
        const transfer = Math.max(0, difference) * Math.min(.16, deltaSeconds * 2.1);
        this.water[index] -= transfer;
        this.water[neighbor] += transfer;
      }
    }
  }

  ApplyVentilationSink(deltaSeconds) {
    if (this.ventilation <= 0) return;
    const exhaustColumn = Math.round(this.WorldToColumn(4.6));
    const sink = Math.min(.38, deltaSeconds * (.55 + this.ventilation * .24));
    for (let column = exhaustColumn - 4; column <= exhaustColumn + 4; column += 1) {
      for (let row = 2; row < Math.round(this.rows * .56); row += 1) {
        const index = this.Index(column, row);
        if (this.solid[index]) continue;
        this.smoke[index] *= 1 - sink;
        this.tracer[index] *= 1 - sink * .65;
        this.velocityY[index] -= sink * 2.2;
      }
    }
  }

  Sample(worldX, normalizedY) {
    const column = this.WorldToColumn(worldX);
    const row = this.NormalizedToRow(normalizedY);
    return {
      smoke: this.SampleGrid(this.smoke, column, row),
      water: this.SampleGrid(this.water, column, row),
      tracer: this.SampleGrid(this.tracer, column, row),
      velocityX: this.SampleGrid(this.velocityX, column, row),
      velocityY: this.SampleGrid(this.velocityY, column, row),
      sdf: this.SampleGrid(this.signedDistance, column, row)
    };
  }

  MeasureStatistics() {
    let smokeMass = 0;
    let waterMass = 0;
    let tracerMass = 0;
    let maximumSmoke = 0;
    let maximumWater = 0;
    for (let index = 0; index < this.count; index += 1) {
      smokeMass += this.smoke[index];
      waterMass += this.water[index];
      tracerMass += this.tracer[index];
      maximumSmoke = Math.max(maximumSmoke, this.smoke[index]);
      maximumWater = Math.max(maximumWater, this.water[index]);
    }
    this.statistics = { smokeMass, waterMass, tracerMass, maximumSmoke, maximumWater };
  }

  GetStatistics() { return { ...this.statistics }; }

  Rasterize() {
    const pixels = this.renderPixels;
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = this.Index(column, row);
        const pixel = index * 4;
        if (this.solid[index]) {
          pixels[pixel] = 0; pixels[pixel + 1] = 0; pixels[pixel + 2] = 0; pixels[pixel + 3] = 0;
          continue;
        }
        const water = Clamp(this.water[index], 0, 1);
        const smoke = Clamp(this.smoke[index], 0, 1) * (1 - water * .72);
        const tracer = Clamp(this.tracer[index], 0, 1) * (1 - Math.max(water, smoke) * .55);
        const waterAbove = row > 0 ? this.water[this.Index(column, row - 1)] : water;
        const waterEdge = Clamp((water - waterAbove) * 2.6, 0, 1);
        const totalAlpha = Clamp(water * .16 + smoke * .9 + tracer * .33 + waterEdge * .12, 0, .96);
        if (totalAlpha <= .003) {
          pixels[pixel] = 0; pixels[pixel + 1] = 0; pixels[pixel + 2] = 0; pixels[pixel + 3] = 0;
          continue;
        }
        const weight = Math.max(.001, water + smoke + tracer * .45 + waterEdge * .4);
        pixels[pixel] = Math.round((water * 42 + smoke * 151 + tracer * 67 * .45 + waterEdge * 154 * .4) / weight);
        pixels[pixel + 1] = Math.round((water * 142 + smoke * 143 + tracer * 207 * .45 + waterEdge * 226 * .4) / weight);
        pixels[pixel + 2] = Math.round((water * 178 + smoke * 132 + tracer * 210 * .45 + waterEdge * 235 * .4) / weight);
        pixels[pixel + 3] = Math.round(totalAlpha * 255);
      }
    }
    return pixels;
  }
}

export function CreateTunnelFluidSimulation(options) { return new TunnelFluidSimulation(options); }

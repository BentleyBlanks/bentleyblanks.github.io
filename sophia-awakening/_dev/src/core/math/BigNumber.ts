import Decimal from "break_infinity.js";

export type BigString = string;
export type BigSource = BigString | number | Decimal;

export function toDecimal(value: BigSource): Decimal {
  return value instanceof Decimal ? value : new Decimal(value || 0);
}

export function big(value: BigSource): BigString {
  return toDecimal(value).toString();
}

export function add(a: BigSource, b: BigSource): BigString {
  return toDecimal(a).add(toDecimal(b)).toString();
}

export function sub(a: BigSource, b: BigSource): BigString {
  return Decimal.max(0, toDecimal(a).sub(toDecimal(b))).toString();
}

export function mul(a: BigSource, b: BigSource): BigString {
  return toDecimal(a).mul(toDecimal(b)).toString();
}

export function div(a: BigSource, b: BigSource): BigString {
  return toDecimal(a).div(toDecimal(b)).toString();
}

export function pow(a: BigSource, exponent: number): BigString {
  return toDecimal(a).pow(exponent).toString();
}

export function gte(a: BigSource, b: BigSource): boolean {
  return toDecimal(a).gte(toDecimal(b));
}

export function gt(a: BigSource, b: BigSource): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

export function min(a: BigSource, b: BigSource): BigString {
  return Decimal.min(toDecimal(a), toDecimal(b)).toString();
}

export function max(a: BigSource, b: BigSource): BigString {
  return Decimal.max(toDecimal(a), toDecimal(b)).toString();
}

export function formatBig(value: BigSource): string {
  const decimal = toDecimal(value);

  if (decimal.lt(1000)) {
    return decimal.toNumber().toFixed(decimal.lt(100) ? 1 : 0).replace(/\.0$/, "");
  }

  const suffixes = ["K", "M", "B", "T", "Qa", "Qi"];
  let scaled = decimal;
  let suffixIndex = -1;

  while (scaled.gte(1000) && suffixIndex < suffixes.length - 1) {
    scaled = scaled.div(1000);
    suffixIndex += 1;
  }

  if (suffixIndex >= suffixes.length - 1 && scaled.gte(1000)) {
    return decimal.toExponential(2).replace("+", "");
  }

  return `${scaled.toNumber().toFixed(scaled.lt(10) ? 2 : 1)}${suffixes[suffixIndex]}`;
}

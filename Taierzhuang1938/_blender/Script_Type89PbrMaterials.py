"""Physical surface authoring for the photographed Tsuchiura Type89 Otsu.

No generated/photographic diffuse lighting is painted into these maps. Coating,
exposed steel, oxide, settled dust and micro-height use separate physical masks.
Object-space attributes make the authoring graph stable through rigid motion
and through temporary atlas-baking proxies. Colours describe the restored car,
not a claim about its original 1938 factory finish.
"""
import bpy
import bmesh
import math
import hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

roles=['Armor','Steel','Track','Rubber','Exhaust','Glass','Guard']


def Attribute(mesh,name,dataType='FLOAT'):
    existing=mesh.attributes.get(name)
    return existing or mesh.attributes.new(name,dataType,'POINT')


def PrepareSurfaceAttributes(objects, samples=12, onObject=None, allObjects=None):
    # Sample the assembled vehicle, including every tread instance. Per-part AO
    # misses the dark seams, fender underside and dirt-catching wheel recesses.
    points=[];triangles=[]
    for obj in allObjects or objects:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles();base=len(points)
        points.extend(obj.matrix_world@vertex.co for vertex in obj.data.vertices)
        triangles.extend(tuple(base+index for index in face.vertices) for face in obj.data.loop_triangles)
    assembly=BVHTree.FromPolygons(points,triangles,all_triangles=True,epsilon=.000001)
    del points,triangles
    seen=set()
    for obj in objects:
        if obj.type!='MESH' or obj.data in seen:
            continue
        seen.add(obj.data)
        mesh=obj.data
        selfOcclusion='BowRoundPortCover' in obj.name
        inverseWorld=obj.matrix_world.inverted()
        mesh.calc_loop_triangles()
        bm=bmesh.new();bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table();bm.normal_update()
        bvh=BVHTree.FromBMesh(bm,epsilon=.000005)
        rest=Attribute(mesh,'RestCoord','FLOAT_VECTOR')
        restWorld=Attribute(mesh,'RestWorld','FLOAT_VECTOR')
        height=Attribute(mesh,'RestHeight')
        convex=Attribute(mesh,'SurfaceConvex')
        cavity=Attribute(mesh,'SurfaceCavity')
        ao=Attribute(mesh,'SurfaceAO')
        dust=Attribute(mesh,'SurfaceDust')
        finish=Attribute(mesh,'SurfaceFinish')
        part=Attribute(mesh,'SurfacePart')
        wear=Attribute(mesh,'SurfaceWear')
        partSeed=int(hashlib.sha256(obj.name.encode()).hexdigest()[:8],16)/0xffffffff
        if not any(value.value for value in finish.data):
            # Explicit zero finish on gun-jacket components is meaningful.
            if not any(token in obj.name for token in ['MachineGun','Mg']):
                for value in finish.data:value.value=1
        isShoe='TrackLink' in obj.name
        isWheel=any(token in obj.name for token in ['Wheel','Idler','Sprocket','Roller'])
        for i,vertex in enumerate(bm.verts):
            rest.data[i].vector=vertex.co
            worldPoint=obj.matrix_world@vertex.co
            restWorld.data[i].vector=worldPoint
            height.data[i].value=worldPoint.z
            part.data[i].value=partSeed
            wear.data[i].value=min(1,max(0,(vertex.co.z+.005)/.025)) if isShoe else 0
            dust.data[i].value=.8 if isShoe else (.55 if isWheel else 0)
            normal=vertex.normal.normalized()
            signed=[]
            for edge in vertex.link_edges:
                delta=vertex.co-edge.other_vert(vertex).co
                if delta.length>1e-8:signed.append(delta.normalized().dot(normal))
            curvature=sum(signed)/max(1,len(signed))
            convex.data[i].value=min(1,max(0,(curvature-.035)*4.0))
            cavity.data[i].value=min(1,max(0,(-curvature-.020)*5.0))
            if normal.length<.5:
                ao.data[i].value=1
                continue
            normal=(obj.matrix_world.to_3x3().inverted().transposed()@normal).normalized()
            tangent=normal.cross(Vector((0,0,1)))
            if tangent.length<.1:tangent=normal.cross(Vector((0,1,0)))
            tangent.normalize();bitangent=normal.cross(tangent).normalized()
            occlusion=0
            origin=worldPoint+normal*.0009
            for sample in range(samples):
                u=(sample+.5)/samples
                angle=sample*2.399963229728653
                radial=math.sqrt(u)
                direction=tangent*(math.cos(angle)*radial)+bitangent*(math.sin(angle)*radial)+normal*math.sqrt(1-u)
                if selfOcclusion:
                    # This cover flips180degrees in the2007 reference. Do not
                    # bake its closed-state contact with the fixed bow onto
                    # the gold inner face that becomes visible when opened.
                    hit,_,_,distance=bvh.ray_cast(inverseWorld@origin,inverseWorld.to_3x3()@direction,.22)
                else:hit,_,_,distance=assembly.ray_cast(origin,direction,.22)
                occlusion+=max(0,1-distance/.22) if hit is not None else 0
            ao.data[i].value=max(.24,1-occlusion/max(1,samples)*.78)
        bm.free()
        if onObject:onObject(obj.name,len(seen))


class SurfaceGraph:
    def __init__(self,role):
        self.role=role
        self.material=bpy.data.materials.new('Material_Type89'+role+'Authoring')
        self.material.use_nodes=True
        self.material.use_fake_user=True
        self.material['Type89Role']=role
        self.material['AuthoringMethod']='metre-scaled physical surface masks; not baked illumination'
        self.nodes=self.material.node_tree.nodes
        self.links=self.material.node_tree.links
        self.nodes.clear()
        self.output=self.nodes.new('ShaderNodeOutputMaterial')
        self.shader=self.nodes.new('ShaderNodeBsdfPrincipled')
        self.emission=self.nodes.new('ShaderNodeEmission')
        self.emission.inputs['Strength'].default_value=1
        self.links.new(self.shader.outputs['BSDF'],self.output.inputs['Surface'])
        self.channels={}

    def Link(self,value,socket):
        if hasattr(value,'node'):
            self.links.new(value,socket)
        else:
            for link in list(socket.links):self.links.remove(link)
            socket.default_value=(value,value,value,1) if socket.type=='RGBA' and isinstance(value,(int,float)) else value

    def Attr(self,name,output='Fac'):
        node=self.nodes.new('ShaderNodeAttribute');node.attribute_name=name;node.label=name
        return node.outputs[output]

    def Math(self,operation,a,b=0,clamp=False):
        node=self.nodes.new('ShaderNodeMath');node.operation=operation;node.use_clamp=clamp
        self.Link(a,node.inputs[0]);self.Link(b,node.inputs[1])
        return node.outputs[0]

    def Color(self,color):
        node=self.nodes.new('ShaderNodeRGB');node.outputs[0].default_value=(*color,1)
        return node.outputs[0]

    def Mix(self,a,b,factor):
        node=self.nodes.new('ShaderNodeMixRGB');node.blend_type='MIX';node.use_clamp=True
        self.Link(factor,node.inputs[0]);self.Link(a,node.inputs[1]);self.Link(b,node.inputs[2])
        return node.outputs[0]

    def Noise(self,coordinate,scale,detail=3):
        node=self.nodes.new('ShaderNodeTexNoise');node.noise_dimensions='3D'
        node.inputs['Scale'].default_value=scale;node.inputs['Detail'].default_value=detail;node.inputs['Roughness'].default_value=.7
        self.Link(coordinate,node.inputs['Vector'])
        return node.outputs['Fac']

    def Scale(self,coordinate,scale):
        node=self.nodes.new('ShaderNodeVectorMath');node.operation='MULTIPLY'
        self.Link(coordinate,node.inputs[0]);node.inputs[1].default_value=scale
        return node.outputs[0]

    def Ramp(self,value,low,high):
        x=self.Math('MULTIPLY',self.Math('SUBTRACT',value,low),1/(high-low),True)
        return self.Math('MULTIPLY',self.Math('MULTIPLY',x,x),self.Math('SUBTRACT',3,self.Math('MULTIPLY',x,2)),True)

    def Build(self):
        role=self.role
        coordinate=self.Attr('RestCoord','Vector')
        height=self.Attr('RestHeight')
        convex=self.Attr('SurfaceConvex')
        cavity=self.Attr('SurfaceCavity')
        ambient=self.Attr('SurfaceAO')
        dustBias=self.Attr('SurfaceDust')
        finish=self.Attr('SurfaceFinish')
        world=self.Attr('RestWorld','Vector')
        part=self.Attr('SurfacePart')
        wear=self.Attr('SurfaceWear')
        grain=self.Noise(coordinate,380 if role=='Armor' else 260,3)
        macro=self.Noise(world,5.5,5)
        breakup=self.Noise(coordinate,135,3)
        meso=self.Noise(coordinate,75,4)
        drips=self.Noise(self.Scale(world,(28,28,1.8)),1,3)
        split=self.nodes.new('ShaderNodeSeparateXYZ');self.Link(coordinate,split.inputs[0])
        geometry=self.nodes.new('ShaderNodeNewGeometry')
        bevel=self.nodes.new('ShaderNodeBevel');bevel.samples=4;bevel.inputs['Radius'].default_value=.0018
        dot=self.nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT'
        self.links.new(geometry.outputs['Normal'],dot.inputs[0]);self.links.new(bevel.outputs['Normal'],dot.inputs[1])
        pixelEdge=self.Math('MULTIPLY',self.Math('SUBTRACT',1,dot.outputs['Value']),28,True)
        restrainedEdge=self.Math('MAXIMUM',pixelEdge,self.Math('MULTIPLY',convex,.035))
        lower=self.Math('MULTIPLY',self.Math('SUBTRACT',1.35,height),1.2,True)
        recess=self.Math('MAXIMUM',cavity,self.Math('SUBTRACT',1,ambient))
        dust=self.Math('MULTIPLY',self.Math('MAXIMUM',self.Math('MULTIPLY',lower,.22),self.Math('MULTIPLY',dustBias,.18)),self.Math('ADD',.3,self.Math('MULTIPLY',macro,1.0)),True)
        chip=self.Math('MULTIPLY',self.Ramp(restrainedEdge,.12,.5),self.Ramp(breakup,.59,.72),True)
        oxide=self.Math('MULTIPLY',recess,self.Ramp(breakup,.48,.68),True)
        dustColor=self.Color((.16,.125,.060))
        oxideColor=self.Color((.10,.045,.018))
        steelColor=self.Color((.38,.41,.41))
        variation=self.Math('ADD',.91,self.Math('ADD',self.Math('MULTIPLY',macro,.12),self.Math('MULTIPLY',part,.020)))
        relief=self.Math('ADD',self.Math('MULTIPLY',grain,.40),self.Math('MULTIPLY',meso,.60))
        if role in ['Armor','Guard']:
            # Recovered2007 paint is a warm olive-brown. The earlier V3 green
            # (.120,.115,.065) lost its red/green separation in the actual PBR
            # render, despite the old colour-diagnostic record. Same-light
            # comparison of the real GLB, then a pigment-only diagnostic,
            # resolves the coating hue without changing illumination.
            base=self.Color((.120,.092,.0403))
            multiply=self.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
            self.Link(base,multiply.inputs[1]);self.Link(variation,multiply.inputs[2]);base=multiply.outputs[0]
            film=self.Math('MULTIPLY',lower,self.Math('ADD',.32,self.Math('MULTIPLY',drips,.30)))
            base=self.Mix(base,self.Color((.046,.0344,.0124)),self.Math('MULTIPLY',film,.25))
            base=self.Mix(base,self.Color((.10,.0632,.0254)),self.Math('MULTIPLY',chip,.75))
            base=self.Mix(base,steelColor,self.Math('MULTIPLY',chip,.18))
            oxide=self.Math('MULTIPLY',oxide,.12)
            base=self.Mix(base,oxideColor,oxide);base=self.Mix(base,dustColor,dust)
            # Thin paint has a broad satin lobe with local dull chalk, rather
            # than one roughness value and a uniformly smooth plastic skin.
            metallic=self.Math('MULTIPLY',chip,.20)
            rough=self.Math('ADD',.60,self.Math('ADD',self.Math('MULTIPLY',meso,.20),self.Math('MULTIPLY',drips,.10)),True)
            badge=self.Attr('MuseumBadge')
            base=self.Mix(base,self.Color((.55,.34,.055)),badge)
            metallic=self.Mix(metallic,.38,badge)
            rough=self.Mix(rough,.43,badge)
            bumpDistance=.00095
        elif role=='Steel':
            base=self.Mix(self.Color((.020,.026,.031)),self.Color((.19,.21,.21)),finish)
            base=self.Mix(base,steelColor,self.Math('MULTIPLY',chip,.75))
            oxide=self.Math('MULTIPLY',oxide,.25)
            base=self.Mix(base,oxideColor,oxide);base=self.Mix(base,dustColor,dust)
            metallic=self.Math('MULTIPLY',.96,self.Math('SUBTRACT',1,self.Math('MAXIMUM',oxide,dust)),True)
            rough=self.Math('ADD',.38,self.Math('MULTIPLY',macro,.20),True)
            bumpDistance=.00035
        elif role=='Track':
            outward=self.Ramp(split.outputs['Z'],-.010,.012)
            running=self.Ramp(split.outputs['Z'],.016,.032)
            mottling=self.Ramp(meso,.16,.85)
            cast=self.Mix(self.Color((.14,.15,.14)),self.Color((.28,.30,.28)),mottling)
            base=self.Mix(self.Color((.036,.032,.023)),cast,outward)
            base=self.Mix(base,self.Color((.42,.44,.43)),self.Math('MULTIPLY',running,self.Ramp(grain,.30,.72)))
            oxide=self.Math('MULTIPLY',self.Math('MULTIPLY',recess,self.Ramp(meso,.40,.68)),.30)
            base=self.Mix(base,oxideColor,oxide)
            dust=self.Math('MULTIPLY',self.Math('SUBTRACT',1,running),self.Math('ADD',.06,self.Math('MULTIPLY',meso,.10)),True)
            base=self.Mix(base,dustColor,dust)
            # The photographed 2007 outer shoe is light abraded cast steel with
            # ingrained film; the later orange-rust shoe is not copied wholesale.
            metallic=self.Math('ADD',.66,self.Math('MULTIPLY',running,.28),True)
            metallic=self.Math('MULTIPLY',metallic,self.Math('SUBTRACT',1,oxide),True)
            rough=self.Mix(self.Math('ADD',.51,self.Math('MULTIPLY',meso,.16)),.34,running)
            abrasion=self.Ramp(self.Noise(self.Scale(coordinate,(180,9,170)),1,2),.64,.77)
            abrasion=self.Math('MULTIPLY',abrasion,outward)
            base=self.Mix(base,self.Color((.37,.39,.38)),self.Math('MULTIPLY',abrasion,.55))
            rough=self.Mix(rough,.33,self.Math('MULTIPLY',abrasion,.65))
            relief=self.Math('ADD',self.Math('MULTIPLY',grain,.40),self.Math('MULTIPLY',meso,.60))
            bumpDistance=.0016
        elif role=='Rubber':
            base=self.Mix(self.Color((.034,.029,.020)),dustColor,self.Math('ADD',.16,self.Math('MULTIPLY',meso,.25),True))
            metallic=0.0;rough=self.Math('ADD',.80,self.Math('MULTIPLY',macro,.13),True);bumpDistance=.00020
        elif role=='Exhaust':
            base=self.Mix(self.Color((.035,.027,.021)),self.Color((.18,.073,.027)),self.Ramp(meso,.20,.80))
            heat=self.Math('MULTIPLY',self.Math('SUBTRACT',self.Math('MULTIPLY',split.outputs['Y'],-1),.32),2.5,True)
            base=self.Mix(base,self.Color((.009,.011,.012)),heat)
            metallic=.35;rough=self.Math('ADD',.70,self.Math('MULTIPLY',meso,.24),True);bumpDistance=.0014
        elif role=='Glass':
            base=self.Color((.91,.95,.96));metallic=0.0
            rough=self.Math('ADD',.12,self.Math('MULTIPLY',grain,.055),True)
            wave=self.nodes.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='X';wave.wave_profile='SIN'
            wave.inputs['Scale'].default_value=110;wave.inputs['Distortion'].default_value=.15;self.Link(coordinate,wave.inputs['Vector']);grain=wave.outputs['Color'];bumpDistance=.00027
            relief=grain
            self.shader.inputs['Transmission Weight'].default_value=.88
            self.shader.inputs['IOR'].default_value=1.50
            ambient=1.0
        else:
            base=self.Color((.003,.004,.004));metallic=0.0;rough=.98;bumpDistance=0
        rough=self.Mix(rough,.92,self.Math('MAXIMUM',oxide,dust)) if role not in ['Glass','Shadow'] else rough
        if hasattr(rough,'node') and rough.type=='RGBA':
            convert=self.nodes.new('ShaderNodeRGBToBW');self.links.new(rough,convert.inputs[0]);rough=convert.outputs[0]
        bump=self.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.62;bump.inputs['Distance'].default_value=bumpDistance
        self.Link(relief,bump.inputs['Height'])
        self.Link(base,self.shader.inputs['Base Color']);self.Link(rough,self.shader.inputs['Roughness']);self.Link(metallic,self.shader.inputs['Metallic']);self.links.new(bump.outputs['Normal'],self.shader.inputs['Normal'])
        microAo=self.Math('SUBTRACT',1,self.Math('MULTIPLY',self.Math('GREATER_THAN',grain,.70),.07)) if role not in ['Glass','Shadow'] else 1.0
        ambient=self.Math('MULTIPLY',ambient,microAo,True)
        # High-source guard holes are geometry. An emitted coverage/opacity pass
        # projects the real openings into the game's continuous curved sheet.
        self.channels={'Base':base,'Roughness':rough,'Metallic':metallic,'Ao':ambient,'Opacity':1.0}
        return self

    def SetBakeChannel(self,channel):
        if channel=='Normal':
            self.links.new(self.shader.outputs['BSDF'],self.output.inputs['Surface'])
        else:
            self.Link(1.0 if channel=='Coverage' else self.channels[channel],self.emission.inputs['Color'])
            self.links.new(self.emission.outputs['Emission'],self.output.inputs['Surface'])

    def Restore(self):
        self.links.new(self.shader.outputs['BSDF'],self.output.inputs['Surface'])


def BuildAuthoringMaterials():
    graphs={role:SurfaceGraph(role).Build() for role in roles+['Shadow']}
    return graphs

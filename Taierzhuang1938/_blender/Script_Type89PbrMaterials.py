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
from mathutils import Vector
from mathutils.bvhtree import BVHTree

roles=['Armor','Steel','Track','Rubber','Exhaust','Glass']


def Attribute(mesh,name,dataType='FLOAT'):
    existing=mesh.attributes.get(name)
    return existing or mesh.attributes.new(name,dataType,'POINT')


def PrepareSurfaceAttributes(objects, samples=12, onObject=None):
    seen=set()
    for obj in objects:
        if obj.type!='MESH' or obj.data in seen:
            continue
        seen.add(obj.data)
        mesh=obj.data
        mesh.calc_loop_triangles()
        bm=bmesh.new();bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table();bm.normal_update()
        bvh=BVHTree.FromBMesh(bm,epsilon=.000005)
        rest=Attribute(mesh,'RestCoord','FLOAT_VECTOR')
        height=Attribute(mesh,'RestHeight')
        convex=Attribute(mesh,'SurfaceConvex')
        cavity=Attribute(mesh,'SurfaceCavity')
        ao=Attribute(mesh,'SurfaceAO')
        dust=Attribute(mesh,'SurfaceDust')
        finish=Attribute(mesh,'SurfaceFinish')
        if not any(value.value for value in finish.data):
            # Explicit zero finish on gun-jacket components is meaningful.
            if not any(token in obj.name for token in ['MachineGun','Mg']):
                for value in finish.data:value.value=1
        isShoe='TrackLink' in obj.name
        isWheel=any(token in obj.name for token in ['Wheel','Idler','Sprocket','Roller'])
        for i,vertex in enumerate(bm.verts):
            rest.data[i].vector=vertex.co
            height.data[i].value=(obj.matrix_world@vertex.co).z
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
            tangent=normal.cross(Vector((0,0,1)))
            if tangent.length<.1:tangent=normal.cross(Vector((0,1,0)))
            tangent.normalize();bitangent=normal.cross(tangent).normalized()
            occlusion=0
            origin=vertex.co+normal*.0006
            for sample in range(samples):
                u=(sample+.5)/samples
                angle=sample*2.399963229728653
                radial=math.sqrt(u)
                direction=tangent*(math.cos(angle)*radial)+bitangent*(math.sin(angle)*radial)+normal*math.sqrt(1-u)
                hit=bvh.ray_cast(origin,direction,.060)[0]
                occlusion+=hit is not None
            ao.data[i].value=max(.20,1-occlusion/max(1,samples)*.75)
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

    def Build(self):
        role=self.role
        coordinate=self.Attr('RestCoord','Vector')
        height=self.Attr('RestHeight')
        convex=self.Attr('SurfaceConvex')
        cavity=self.Attr('SurfaceCavity')
        ambient=self.Attr('SurfaceAO')
        dustBias=self.Attr('SurfaceDust')
        finish=self.Attr('SurfaceFinish')
        grain=self.Noise(coordinate,720 if role=='Armor' else 440,2)
        macro=self.Noise(coordinate,8.5,4)
        breakup=self.Noise(coordinate,115,3)
        geometry=self.nodes.new('ShaderNodeNewGeometry')
        bevel=self.nodes.new('ShaderNodeBevel');bevel.samples=4;bevel.inputs['Radius'].default_value=.0018
        dot=self.nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT'
        self.links.new(geometry.outputs['Normal'],dot.inputs[0]);self.links.new(bevel.outputs['Normal'],dot.inputs[1])
        pixelEdge=self.Math('MULTIPLY',self.Math('SUBTRACT',1,dot.outputs['Value']),28,True)
        restrainedEdge=self.Math('MAXIMUM',pixelEdge,self.Math('MULTIPLY',convex,.035))
        lower=self.Math('MULTIPLY',self.Math('SUBTRACT',.72,height),1.8,True)
        dust=self.Math('MAXIMUM',self.Math('MULTIPLY',lower,.28),self.Math('MULTIPLY',dustBias,.35))
        dust=self.Math('MULTIPLY',dust,self.Math('ADD',.4,self.Math('MULTIPLY',macro,.6)),True)
        chip=self.Math('MULTIPLY',self.Math('GREATER_THAN',restrainedEdge,.075),self.Math('GREATER_THAN',breakup,.57),True)
        oxide=self.Math('MULTIPLY',self.Math('MAXIMUM',cavity,self.Math('SUBTRACT',1,ambient)),self.Math('GREATER_THAN',breakup,.48),True)
        dustColor=self.Color((.205,.174,.108))
        oxideColor=self.Color((.095,.033,.012))
        steelColor=self.Color((.38,.41,.41))
        variation=self.Math('ADD',.94,self.Math('MULTIPLY',macro,.12))
        if role=='Armor':
            base=self.Color((.205,.188,.091))
            multiply=self.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
            self.Link(base,multiply.inputs[1]);self.Link(variation,multiply.inputs[2]);base=multiply.outputs[0]
            chip=self.Math('MULTIPLY',chip,.96)
            oxide=self.Math('MULTIPLY',oxide,.10)
            base=self.Mix(base,steelColor,chip);base=self.Mix(base,oxideColor,oxide);base=self.Mix(base,dustColor,dust)
            metallic=self.Math('MULTIPLY',chip,.96)
            rough=self.Math('ADD',.68,self.Math('MULTIPLY',macro,.12),True)
            bumpDistance=.00022
        elif role=='Steel':
            base=self.Mix(self.Color((.020,.026,.031)),self.Color((.19,.21,.21)),finish)
            base=self.Mix(base,steelColor,self.Math('MULTIPLY',chip,.75))
            oxide=self.Math('MULTIPLY',oxide,.25)
            base=self.Mix(base,oxideColor,oxide);base=self.Mix(base,dustColor,dust)
            metallic=self.Math('MULTIPLY',.96,self.Math('SUBTRACT',1,self.Math('MAXIMUM',oxide,dust)),True)
            rough=self.Math('ADD',.38,self.Math('MULTIPLY',macro,.20),True)
            bumpDistance=.00018
        elif role=='Track':
            base=self.Mix(self.Color((.068,.079,.078)),steelColor,self.Math('MULTIPLY',chip,.85))
            oxide=self.Math('MULTIPLY',oxide,.58)
            base=self.Mix(base,oxideColor,oxide)
            dust=self.Math('MULTIPLY',self.Math('SUBTRACT',1,self.Math('MULTIPLY',convex,.70)),self.Math('ADD',.12,self.Math('MULTIPLY',macro,.20)),True)
            base=self.Mix(base,dustColor,dust)
            metallic=self.Math('MULTIPLY',.97,self.Math('SUBTRACT',1,self.Math('MAXIMUM',oxide,dust)),True)
            rough=self.Math('ADD',.54,self.Math('MULTIPLY',macro,.25),True)
            bumpDistance=.00065
        elif role=='Rubber':
            base=self.Mix(self.Color((.027,.025,.020)),dustColor,self.Math('ADD',.24,self.Math('MULTIPLY',macro,.24),True))
            metallic=0.0;rough=self.Math('ADD',.80,self.Math('MULTIPLY',macro,.13),True);bumpDistance=.00020
        elif role=='Exhaust':
            base=self.Mix(self.Color((.045,.040,.034)),self.Color((.12,.041,.014)),self.Math('ADD',.23,self.Math('MULTIPLY',macro,.45),True))
            split=self.nodes.new('ShaderNodeSeparateXYZ');self.Link(coordinate,split.inputs[0])
            heat=self.Math('MULTIPLY',self.Math('SUBTRACT',self.Math('MULTIPLY',split.outputs['Y'],-1),.32),2.5,True)
            base=self.Mix(base,self.Color((.009,.011,.012)),heat)
            metallic=.35;rough=self.Math('ADD',.72,self.Math('MULTIPLY',macro,.20),True);bumpDistance=.00055
        elif role=='Glass':
            base=self.Color((.91,.95,.96));metallic=0.0
            rough=self.Math('ADD',.12,self.Math('MULTIPLY',grain,.055),True)
            wave=self.nodes.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction='X';wave.wave_profile='SIN'
            wave.inputs['Scale'].default_value=110;wave.inputs['Distortion'].default_value=.15;self.Link(coordinate,wave.inputs['Vector']);grain=wave.outputs['Color'];bumpDistance=.00027
            self.shader.inputs['Transmission Weight'].default_value=.88
            self.shader.inputs['IOR'].default_value=1.50
            ambient=1.0
        else:
            base=self.Color((.003,.004,.004));metallic=0.0;rough=.98;bumpDistance=0
        rough=self.Mix(rough,.92,self.Math('MAXIMUM',oxide,dust)) if role not in ['Glass','Shadow'] else rough
        if hasattr(rough,'node') and rough.type=='RGBA':
            convert=self.nodes.new('ShaderNodeRGBToBW');self.links.new(rough,convert.inputs[0]);rough=convert.outputs[0]
        bump=self.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.62;bump.inputs['Distance'].default_value=bumpDistance
        self.Link(grain,bump.inputs['Height'])
        self.Link(base,self.shader.inputs['Base Color']);self.Link(rough,self.shader.inputs['Roughness']);self.Link(metallic,self.shader.inputs['Metallic']);self.links.new(bump.outputs['Normal'],self.shader.inputs['Normal'])
        microAo=self.Math('SUBTRACT',1,self.Math('MULTIPLY',self.Math('GREATER_THAN',grain,.70),.07)) if role not in ['Glass','Shadow'] else 1.0
        ambient=self.Math('MULTIPLY',ambient,microAo,True)
        self.channels={'Base':base,'Roughness':rough,'Metallic':metallic,'Ao':ambient}
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

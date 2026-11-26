"""Physical coatings and working faces for the reconstructed Type 94 exterior."""

import bpy


POINT_ATTRIBUTE = "Type94PhotoSurfacePoint"
CONTACT_ATTRIBUTE = "Type94PhotoContact"


def Attribute(tree, name):
    node = tree.nodes.new("ShaderNodeAttribute")
    node.attribute_name = name
    node.label = name
    return node


def Noise(tree, coordinates, scale, detail, label):
    node = tree.nodes.new("ShaderNodeTexNoise")
    node.label = label
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    tree.links.new(coordinates,node.inputs["Vector"])
    return node.outputs["Fac"]


def Ramp(tree, factor, values, label):
    node = tree.nodes.new("ShaderNodeValToRGB")
    node.label = label
    for element, (position, color) in zip(node.color_ramp.elements, values):
        element.position = position
        element.color = (*color,1) if isinstance(color,tuple) else (color,color,color,1)
    tree.links.new(factor,node.inputs[0])
    return node.outputs["Color"]


def Mix(tree, factor, first, second, label):
    node = tree.nodes.new("ShaderNodeMixRGB")
    node.label = label
    for i,value in enumerate([factor,first,second]):
        if isinstance(value,bpy.types.NodeSocket):
            tree.links.new(value,node.inputs[i])
        else:
            node.inputs[i].default_value = value
    return node.outputs[0]


def Math(tree, operation, a, b):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for i,value in enumerate((a,b)):
        if isinstance(value,bpy.types.NodeSocket):
            tree.links.new(value,node.inputs[i])
        else:
            node.inputs[i].default_value = value
    return node.outputs[0]


def BuildPhotoMaterials():
    specs = {
        "Sheet": dict(role="Paint", color=(.103,.114,.078), roughness=(.30,.49), metal=.0, depth=.00006, coat=.16),
        "Cast": dict(role="Paint", color=(.083,.091,.062), roughness=(.42,.64), metal=.0, depth=.00023, coat=.08),
        "Wheel": dict(role="Paint", color=(.076,.085,.055), roughness=(.43,.65), metal=.0, depth=.00019, coat=.07),
        "Track": dict(role="Track", color=(.041,.047,.042), roughness=(.53,.72), metal=.76, depth=.00028, coat=.0),
    }
    results = {}
    for label, spec in specs.items():
        role = spec["role"]
        material = bpy.data.materials.new(f"Material_Type94{role}Photo{label}V107")
        material["Type94RuntimeRole"] = role
        material["Type94PhotoSurface"] = label
        material.diffuse_color = (*spec["color"],1)
        material.use_nodes = True
        tree = material.node_tree
        shader = next(node for node in tree.nodes if node.type=="BSDF_PRINCIPLED")
        shader.label = {
            "Sheet":"Olive enamel over rolled steel",
            "Cast":"Olive enamel over casting",
            "Wheel":"Painted cast drive web",
            "Track":"Track casting and polished working lands",
        }[label]
        point = Attribute(tree,POINT_ATTRIBUTE).outputs["Vector"]
        contact = Attribute(tree,CONTACT_ATTRIBUTE).outputs["Fac"]
        undulation = Noise(tree,point,19,2,"Centimetre finish variation")
        grain = Noise(tree,point,910 if label=="Sheet" else 665,2,"Coating grain" if label=="Sheet" else "Cast texture")
        wearNoise = Noise(tree,point,168,2,"Interrupted edge contact")
        mask = Ramp(tree,wearNoise,[(.37,.16),(.69,1.0)],"Unequal contact")
        exposed = Math(tree,"MULTIPLY",contact,mask)
        color = spec["color"]
        field = Ramp(tree,undulation,[(.18,tuple(c*.80 for c in color)),(.82,tuple(c*1.18 for c in color))],"Olive pigment or dark track")
        bare = Ramp(tree,wearNoise,[(.19,(.102,.107,.100)),(.80,(.215,.221,.217))],"Exposed steel reflectance")
        tree.links.new(Mix(tree,exposed,field,bare,"Effective exposed steel"),shader.inputs["Base Color"])
        rough = Ramp(tree,grain,[(.15,spec["roughness"][0]),(.85,spec["roughness"][1])],"Uneven coating sheen")
        tree.links.new(Mix(tree,exposed,rough,(.235,.235,.235,1),"Smooth contact lands"),shader.inputs["Roughness"])
        tree.links.new(Mix(tree,exposed,(spec["metal"],)*3+(1,),(.94,.94,.94,1),"Metal from exposed substrate"),shader.inputs["Metallic"])
        relief = tree.nodes.new("ShaderNodeBump")
        relief.label = "Submillimetre coating and casting relief"
        relief.inputs["Distance"].default_value = spec["depth"]
        tree.links.new(Math(tree,"SUBTRACT",.64,Math(tree,"MULTIPLY",.50,exposed)),relief.inputs["Strength"])
        tree.links.new(grain,relief.inputs["Height"])
        tree.links.new(relief.outputs["Normal"],shader.inputs["Normal"])
        shader.inputs["Coat Weight"].default_value = spec["coat"]
        shader.inputs["Coat Roughness"].default_value = .28 if label=="Sheet" else .41
        results[label] = material
    return results


def PhotoMaterialAttributes(asset):
    done = set()
    for obj in asset.children_recursive:
        if obj.type != "MESH" or obj.data in done:
            continue
        mesh = obj.data
        done.add(mesh)
        labels = {i:m.get("Type94PhotoSurface") for i,m in enumerate(mesh.materials) if m.get("Type94PhotoSurface")}
        if not labels:
            continue
        coordinates = mesh.attributes.new(POINT_ATTRIBUTE,"FLOAT_VECTOR","POINT")
        contact = mesh.attributes.new(CONTACT_ATTRIBUTE,"FLOAT","POINT")
        levels = [0.] * len(mesh.vertices)
        for polygon in mesh.polygons:
            label = labels.get(polygon.material_index)
            if not label:
                continue
            for vid in polygon.vertices:
                p = mesh.vertices[vid].co
                if label=="Track":
                    amount = .98 if p.z > .010 else .55 if abs(p.x) > .079 else .24 if p.z < -.035 else .0
                elif label=="Sheet":
                    world = obj.matrix_world @ p
                    amount = .18 if world.y > 1.364 or abs(world.x) > .806 else .0
                else:
                    amount = .10
                levels[vid] = max(levels[vid],amount)
        for vertex, coordinate, weight, level in zip(mesh.vertices,coordinates.data,contact.data,levels):
            coordinate.vector = vertex.co
            weight.value = level

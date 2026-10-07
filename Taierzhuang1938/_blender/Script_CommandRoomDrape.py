"""Art-directed empty garments, following the user's side-hung coat / crushed cap.

Metres, Blender Z up. Broad structural drape is geometry; weave is a PBR tile.
The coat is gathered at one hook, with a collapsed torso and hollow open sleeves.
"""
capPath=GAME/'_blender/Script_CommandRoomReferenceCap.py'
exec(compile(capPath.read_text(encoding='utf-8'),str(capPath),'exec'),globals())

coatPath=GAME/'_blender/Script_CommandRoomHangingCoat.py'
exec(compile(coatPath.read_text(encoding='utf-8'),str(coatPath),'exec'),globals())

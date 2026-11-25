"""Resolve a campaign rig's body through the same manifest used by the game."""

import json
from pathlib import Path


def CharacterBodyPath(project, modelId):
    manifest = json.loads(
        (
            Path(project) / "Model/Character/Data_TengxianCharacterManifest.json"
        ).read_text(encoding="utf-8")
    )
    baseId = modelId.removesuffix("Facial")
    row = next((record for record in manifest["models"] if record["id"] == baseId), None)
    if row is None:
        return Path(project) / "Model/Character" / ("Model_" + modelId + ".glb")
    return Path(project) / row["facialUrl" if modelId != baseId else "url"]

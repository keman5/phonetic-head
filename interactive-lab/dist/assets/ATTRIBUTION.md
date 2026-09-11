# Anatomy asset attribution

Z-Anatomy, Gauthier Kervyn and contributors. Source distribution: https://github.com/LluisV/Z-Anatomy-Sample at b6da5cd4a98309b62ee9ffc7720c77a8e18cee40.

Source and adapted anatomy assets: CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ . Retain attribution and share-alike terms when redistributing these assets.

Adaptations: source head/neck selection, local V04 stitched/subdivided skin, fitted eyeballs, left/right sagittal mesh split, authored phonetic morph targets, glTF export. These educational deformations and flow paths are not medically validated biomechanics or CFD. The loaded geometry is derived from the user's local Blender white model. No original personal data was uploaded.

Three.js r180: MIT license; library license distributed in vendor/LICENSE.

Additional skin adaptation: coincident-vertex welding, normal cleanup, inward shell/voxel seam union, smoothing and decimation, with authored morph displacements transferred from the original skin surface. The repaired-skin.glb derivative remains CC BY-SA 4.0. Original internal anatomical geometry is unchanged. See skin-repair-report.json and the repository repair_skin_seams.py for parameters and source hash.

character-heads.glb: locally generated teaching meshes authored by build_character_heads.py. Mickey Mouse and Tom character references belong to their respective rights holders. No third-party character mesh was downloaded or incorporated. Their displayed internal oral structures use the attributed Z-Anatomy teaching assets above.

Character heads (revised): independently sculpted classic Mickey Mouse and Tom Cat interpretations with separate head proportions, face masks, ears, fur/whisker details, stylised oral geometry and phonetic morph normals. No official character model or texture was imported. Mickey Mouse is a Disney character; Tom Cat is a Tom and Jerry character associated with Warner Bros. The original human anatomy asset and its attribution remain separate.

Solid human core: a closed volume derived from the repaired human skin envelope, with explicit base/crown/median closures, a bounded oral recess, and transferred phonetic displacements. This derived human anatomy asset follows the existing CC BY-SA 4.0 attribution. See build_solid_core.py and solid-core-report.json.

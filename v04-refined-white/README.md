# V04 refined white model

Derived from Z-Anatomy by Gauthier Kervyn and contributors, distributed at https://github.com/LluisV/Z-Anatomy-Sample, revision b6da5cd4a98309b62ee9ffc7720c77a8e18cee40. Source and adaptations: CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/ . Retain attribution and share-alike terms on redistribution.

Changes: joined source skin regions, merged nearby vertices within 1.2 mm, recalculated surface normals, added reversible two-level subdivision. Two fitted white eyeballs fill the orbital openings; these are modeling approximations rather than source atlas structures. Regenerated sagittal copies from the evaluated surface.

Validation: original internal mesh vertex arrays are compared exactly against V03; see validation.json. All five PNGs are Blender renders. Full exterior opens by default; toggle collection 01 off and collection 02 on for the sagittal cutaway. V03 and earlier files remain unchanged.

The face is smoother but source region seams remain visible around the scalp, eyelids and mouth. These require further local topology repair; they are not completely removed. Internal anatomy remains the atlas approximation. No articulation rig, airflow simulation or cartoon material is included in this white-model stage. No online publication.

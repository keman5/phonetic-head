# Head white model V01 — local review

Open `phonetic-head-white-v01.blend` in Blender. Collection A contains the complete model; collection B contains its sagittal cutaway. B is visible by default. Toggle the collections in the Outliner to compare them; do not display both at once.

Four PNGs provide a sagittal view, oblique cutaway, oblique exterior and front exterior. Objects for tongue, soft palate, hard palate, epiglottis, laryngeal cartilage, vocal folds, tracheal rings and individual teeth are separately editable.

This is a shape-review draft made in Blender, guided by the supplied sagittal pronunciation diagram. Transverse dimensions and exterior facial volumes are inferred, not reconstructed from a scan. Nasal conchae, detailed intrinsic tongue muscles, periodontal anatomy and validated articulation deformation are not included. Lip/ear sculpting and cavity-wall smoothing remain refinement work. This is not a claim of complete anatomical fidelity.

Coordinates are in millimetres with Blender unit scale 0.001. The scene is static; no animation or frontend integration is included in this review stage. No online publication was performed.

Rebuild locally using Blender's background Python mode with `build_white_model.py`.

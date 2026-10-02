# 连续曲面修复

本次修复直接修改 Blender 生成的几何，不依赖图片遮盖或网页叠加片。

- 太阳穴、耳根、面颊、下颌：在左右合并后的网格上，沿原始分区的非流形边界做 12 mm 范围的渐变平滑；鼻翼和唇缘另加保护权重。
- 眼部：封闭体与眼眶做体素并集，再平滑成与皮肤连续的眼睑表面。原有拟合眼球留在内部，不再承担堵住皮肤洞口的任务。
- 非预期针孔：重建口缝前填补小边界；导出前检查，除功能性口缝之外不得存在开放边或重叠边。
- 舌头、软腭、悬雍垂、牙龈：左右先焊接再细分，每一个原始形态键单独在相同拓扑上求值，最后才重新切半。舌头由 343 个焊接顶点细分到 8,186 个；不将需要独立运动的器官焊在一起。
- 左右接缝：保留相同位置和位移，网页统一中线法线。原有 24 个组合控制通道、48 个音标教学条目和 20 段 Blender 元音动作保持。
- 剖面横向暗带：内部填充体的各形态键中线固定在切面上；剖面轮廓跨越短暂缺失的口缝采样行，避免把口缝误扩展为穿过颈部的裂口。测试按 21 个张嘴阶段检查后侧切面的连续覆盖。

`phonetic-head.glb` 是未改动的解剖来源；网页使用替换皮肤和 `smooth-articulators.glb`。新 Blender 审阅文件为仓库根目录的 `phonetic-head-smooth-teaching.blend`，旧儿童预览文件保留。剖面填充与气流仍由网页生成，不是 Blender 医学模拟。

## 本地重建

在仓库根目录按顺序运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python repair_skin_seams.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python refine_articulators.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python build_solid_core.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python build_teaching_preview.py
```

## 验证

在 `interactive-lab` 目录启动 `npm start` 后运行：

```sh
node --test test.mjs surface-quality.test.mjs phonemes.test.mjs teaching.test.mjs render-utils.test.mjs learning.test.mjs audio.test.mjs
node --test model-interaction.test.mjs
```

新增测试检查两侧眼部表面覆盖、中线法线和所有皮肤形态键的位移连续性、细分器官的完整通道、来源哈希和缓冲区有效性。几何报告的表面偏差只统计保留皮肤，新增加的眼睑闭合体单列，不将其误计为旧表面漂移。

正常的口腔开口、器官之间的活动空间和用户选择的中线剖面保留；“无缝”不代表把这些教学必需空间封死。此模型是教学近似，不是经临床验证的发音肌肉模拟。

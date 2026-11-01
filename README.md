# 发音探索乐园 · 本地三维音标教学

使用可编辑的 Blender 人头和角色模型，演示口唇、舌位、软腭、声带与气流配合。支持48个教学条目（英式44音素＋4组辅音组合）、20元音、26字母、男女合成示范音及慢动作。

儿童模式默认不显示骨骼（保留教学所需的牙齿），鼻腔、口腔及气道以封闭色块表示空间范围。色块不是“器官被实心组织填满”的医学描述。发音动作、声音及接触几何仍需教师复核。

## 本地启动

```sh
cd interactive-lab
npm ci
npm start
```

打开 http://127.0.0.1:4173/ 。本地服务仅绑定本机。

## 线上部署

线上地址：https://test.upit.top/ 。在项目根目录运行 `bash deploy.sh`：通过根目录 `build.sh` 在本地安装依赖、运行数据/资产与服务端测试，打包现有 `interactive-lab/dist`，上传到 `51tokens` 后校验并热加载 Caddy。VPS 不执行构建。仅生成部署包可运行 `bash build.sh /tmp/phonetic-head-site.tar.gz`。

Cloudflare 中 `test` 为已代理的 A 记录，指向 `89.116.220.139`。源站使用现有 Caddy 的内部证书，与当前 Cloudflare Full 回源方式配合；不要直接用于 Full (strict)。部署文件位于 `/opt/cf-origin-ssl/phonetic-head`，`current` 指向对应 release；配置校验或源站检查失败时脚本恢复先前配置与版本。

线上由 Caddy 直接提供课程、三维模型、音频和浏览器录音功能；学习进度仍只保存在浏览器。AI 教练接口明确返回未配置，不上传任何本地 `.env` 或密钥。部署包不包含 Blender 源文件、Python 语音模型或开发依赖。

## 文件入口

- `interactive-lab/dist/`：可直接运行的网页、模型及本地音频。
- `interactive-lab/README.md`：模型、音频、交互与重建说明。
- `interactive-lab/TEACHING-REVIEW.md`：教学口径、已知限制及待校准项目。
- `phonetic-head-child-teaching.blend`：儿童配色的可编辑模型；20元音时间轴，骨骼细节默认隐藏。网页剖面色块及引导标签是运行时功能。
- `export_interactive.py` → `repair_skin_seams.py` → `build_solid_core.py`：顺序重建真人GLB；`build_character_heads.py` 重建角色，`build_teaching_preview.py` 另存儿童Blender预览。

## 验证

在 `interactive-lab/` 执行 `npm test`。本地服务启动后，可运行 `node check-teaching.mjs`、`node check-vowels.mjs`、`node check-browser.mjs`、`node check-audio-ui.mjs`，使用本机 Google Chrome 检查网页。截图写入不提交的 `qa/`。

## Git 管理

延续已有仓库和提交历史，不重新初始化，不改写历史。代码、依赖锁文件、可复现的生成脚本、教学文档及运行所需模型/音频一起版本管理。已有模型使用普通 Git 二进制记录，本次不迁移到 LFS。

`node_modules`、Python虚拟环境、缓存、日志、测试截图、Blender自动备份与 `.env` 不进入提交；`.gitattributes` 明确文本换行和模型/音频的二进制类型。

日常先用 `git status` / `git diff` 检查变更，再选择文件 `git add <文件>`、`git commit -m "说明"`；用 `git log --oneline` 回看版本。已有 `origin` 保留，未授权时不推送、不发布。

## 早期 V01 白模说明（历史参考）

Open `phonetic-head-white-v01.blend` in Blender. Collection A contains the complete model; collection B contains its sagittal cutaway. B is visible by default. Toggle the collections in the Outliner to compare them; do not display both at once.

Four PNGs provide a sagittal view, oblique cutaway, oblique exterior and front exterior. Objects for tongue, soft palate, hard palate, epiglottis, laryngeal cartilage, vocal folds, tracheal rings and individual teeth are separately editable.

This is a shape-review draft made in Blender, guided by the supplied sagittal pronunciation diagram. Transverse dimensions and exterior facial volumes are inferred, not reconstructed from a scan. Nasal conchae, detailed intrinsic tongue muscles, periodontal anatomy and validated articulation deformation are not included. Lip/ear sculpting and cavity-wall smoothing remain refinement work. This is not a claim of complete anatomical fidelity.

Coordinates are in millimetres with Blender unit scale 0.001. The scene is static; no animation or frontend integration is included in this review stage. No online publication was performed.

Rebuild locally using Blender's background Python mode with `build_white_model.py`.

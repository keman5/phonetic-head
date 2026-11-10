# 发音探索乐园 · 本地三维音标教学

使用可编辑的 Blender 人头和角色模型，演示口唇、舌位、软腭、声带与气流配合。支持48个教学条目（英式44音素＋4组辅音组合）、20元音、26字母、男女合成示范音及慢动作。

儿童模式默认不显示骨骼（保留教学所需的牙齿），鼻腔、口腔及气道以封闭色块表示空间范围。色块不是“器官被实心组织填满”的医学描述。发音动作、声音及接触几何仍需教师复核。

## 本地启动

```sh
cd interactive-lab
npm ci
npm run dev
```

打开 http://127.0.0.1:4173/ 。本地服务仅绑定本机。

## 线上部署

线上地址：https://test.upit.top/ 。在项目根目录运行 `bash deploy.sh`：通过根目录 `build.sh` 在本地安装依赖、运行数据/资产、服务端与管理端浏览器测试，打包 `interactive-lab/dist` 和 Node 管理服务，上传到 `51tokens` 后启动 systemd 服务、校验并热加载 Caddy。VPS 不执行构建，也不安装 npm 依赖。仅生成部署包可运行 `bash build.sh /tmp/phonetic-head-site.tar.gz`。

Cloudflare 中 `test` 为已代理的 A 记录，指向 `89.116.220.139`。源站使用现有 Caddy 的内部证书，与当前 Cloudflare Full 回源方式配合；不要直接用于 Full (strict)。部署文件位于 `/opt/cf-origin-ssl/phonetic-head`，`current` 指向对应 release；配置校验或源站检查失败时脚本恢复先前配置与版本。

仅在已上传的包保持不变、需要修正服务或 Caddy 配置时，可用 `DEPLOY_RESUME_RELEASE=<发布编号> bash deploy.sh` 重新激活该包；源代码有变化时必须重新执行完整构建部署。

线上由 Caddy 提供静态资源，并将 `/api/*` 转发到仅监听 `127.0.0.1:4174` 的 `phonetic-head.service`。学习进度仍只保存在浏览器。课程、管理员密码哈希、语音配置及上传/生成音频保存在 `/var/lib/phonetic-head`，不随 release 替换。部署包不包含这些运行数据、本地 `.env`、Blender 源文件、Python 语音模型或开发依赖。AI 对话教练仍需单独配置，语音服务密钥不等于对话服务密钥。

## 课程管理

入口：https://test.upit.top/admin.html ，初始管理员账号 `admin`、密码 `111111`。首次登录必须设置至少 10 位的新密码；后台提供修改密码和退出登录。新密码不会被后续部署重置。

- 课程管理：修改四阶段的英文、中文、音标、教学提示、情境与听音选择题；复制课程创建新课，保存草稿、发布或下架。已发布内容不会随草稿编辑变化，学生刷新后读取最新发布版本。
- 示范语音：每阶段的男女声分别选择内置示范、上传 PCM WAV / MP3、ElevenLabs、Azure Neural TTS。上传限 20 MB / 120 秒；单音保留内置音或使用审核过的录音。修改文字后清空旧音标与口型映射，发布会阻止复用不匹配的旧音频。
- 语音服务：在后台填写 ElevenLabs 密钥、模型和男女声 Voice ID，或 Azure Speech 密钥、资源地区和声音名称。密钥仅在服务端保存，不回传浏览器。预生成音频保存后直接播放；动态音频只在点击播放时生成，按内容和音色缓存，重启及部署后继续复用。修改动态音色后需重新发布对应课程。
- 额度：默认每日 50000 字符，按 UTC 日期计数，同时最多生成两段；可在后台设置为 0 暂停生成。失败请求也占用本地预算；第三方实际计费及商用授权以供应商为准。媒体总容量限制为 1 GB。
- 对齐：ElevenLabs 提供可用的字符时间戳时转换为单词时间；Azure REST 和上传文件使用估计词时长。词内音素始终是教学比例示意，不宣称精确口型对齐。未配置音素的新增内容可以听读，不显示错误口型。

本地管理数据默认在被 Git 忽略的 `interactive-lab/data`。Node 22 或更新版本可运行服务；`DATA_DIR` 可指定持久目录，公开部署需设置 `PUBLIC_ORIGIN`。VPS 可选的对话教练环境文件为 `/etc/phonetic-head.env`，它不包含在部署包中。

验证入口：`npm run test:server` 检查权限、持久化、发布与两家 TTS 的模拟接口；`npm run test:admin-ui` 在后台使用已安装浏览器验证编辑、上传、发布、播放与动态缓存。实际供应商音色与账单需要配置真实密钥后试听验证。

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

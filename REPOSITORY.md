# 本地版本管理

仓库根目录为本文件所在的 `phonetic-head-blender`。`main` 分支管理 Blender 建模/导出脚本、V01–V04 命名模型和预览图、解剖来源说明，以及 `interactive-lab/` 中的交互页面、GLB、依赖锁文件和测试。

`interactive-lab/dist/` 是直接编写的可运行静态网站，必须提交；其中 vendor 是随网站分发的本地 Three.js 依赖，使页面不依赖 CDN。

忽略内容：node_modules、浏览器检查输出 qa、Blender 自动备份 `.blend1` 等、临时下载 `visceral-download.fbx`、中间导入文件 `anatomy-import.blend`，以及独立的上游克隆 `anatomy-source/`。忽略不会删除本地文件。

## 本地启动

```sh
cd interactive-lab
npm ci
npm start
```

浏览器访问 http://127.0.0.1:4173/ 。`npm test` 验证动作阶段、透明度和模型形变数据。

## 上游资源恢复

上游仓库：https://github.com/LluisV/Z-Anatomy-Sample
固定版本：`b6da5cd4a98309b62ee9ffc7720c77a8e18cee40`。

需要从头运行 Blender 导入流程时，将该仓库检出到 `anatomy-source/`，取得 `Assets/Models/1.0 Models/` 下的 VisceralSystem100、SkeletalSystem100、MuscularSystem100 和 Regions of human body100 四个 FBX。随后运行 `inspect_anatomy.py` 生成中间导入文件。建模脚本中的 ROOT/OUT 目前仍是本机绝对路径，换电脑运行需修改。

模型资产的来源、CC BY-SA 4.0 许可及改动说明保留在各版本 README 和 `interactive-lab/dist/assets/ATTRIBUTION.md`。Git 初始化不改变这些许可。

本仓库仅在本地创建，无远程仓库配置。命名 `.blend` 与 `.glb` 目前以普通 Git 二进制文件管理；将来推送到托管平台前，应根据平台文件限制决定是否迁移至 Git LFS。

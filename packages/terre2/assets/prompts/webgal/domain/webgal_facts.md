WebGAL 核心语法与常用命令（事实卡，来自官方文档）

背景/立绘
- changeBg:path [-enter|-exit|-duration=ms|-ease=...|-transform={...}]；path=none 表示关闭背景
- changeFigure:path [-left|-right|-id=xxx|-next|-transform={...}]；path=none 表示关闭对应位/ID
- miniAvatar:path | miniAvatar:none（显示/关闭文本框小头像）

音频
- bgm:file.mp3 [-volume=0..100|-enter=ms|-unlockname=Name|-series=Series]；空/none 停止
- playEffect:file.wav [-volume=0..100|-id=xxx]；none 或相同 id 停止该效果音
- 语音示例：角色:台词 -V1.ogg [-volume=30]
- unlockBgm:file.mp3 [-name=显示名|-series=系列]
- unlockCg:file.png [-name=显示名|-series=系列]

文本与全屏文字
- intro:文本A|文本B [-animation=...|-delay=ms|-hold|-useForward|-fontSize=...|-fontColor=rgba(...)]
- 普通台词：角色名:内容

控制流与变量
- label:xxx / jumpLabel:xxx / changeScene:path
- setVar:k=v 或表达式；-global 定义全局变量；-when 条件执行（字符串表达式）
- 全局参数：next/continue/when；next=true 时后续语句并发执行，keep 可跨语句保持动画

动画与变换
- setTransform:{JSON} -target=xxx [-duration=ms|-writeDefault|-keep]
- setAnimation:Name -target=xxx [-writeDefault|-keep]
- setTempAnimation:[{...},...] -target=xxx [-writeDefault|-keep]
- setTransition: -target=xxx [-enter=Anim|-exit=Anim]

校验
- validate_script(path) 可用于查错；建议在写入后再次校验

工程结构（模板）
- 引擎/模板目录应含 assets、game、icons、index.html、manifest.json、webgal-serviceworker.js


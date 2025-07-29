# Cherry Studio HMOS Desktop 适配改动总结

## 项目概述

本项目基于 [Cherry Studio v1.4.5](https://github.com/CherryHQ/cherry-studio.git) 进行鸿蒙桌面系统（HMOS Desktop）适配。主要改动包括平台检测、本地大模型支持、UI适配、功能隐藏等。

## 主要改动文件

### 1. 主进程文件 (`src/main/`)

#### `src/main/index.ts`
- **改动内容**: 添加鸿蒙平台适配逻辑
- **具体修改**:
  - 在托盘服务初始化后添加注释：`// 适配鸿蒙，先创建托盘然后创建应用`
  - 优化应用启动流程，确保托盘服务在窗口创建前初始化

#### `src/main/services/TrayService.ts`
- **改动内容**: 鸿蒙托盘适配
- **具体修改**:
  - 添加鸿蒙平台检测：`process.platform === 'ohos'`
  - 为鸿蒙平台添加特殊的托盘图标设置逻辑
  - 注释掉选择助手相关功能（鸿蒙暂不支持）
  - 优化托盘菜单显示逻辑
  - 添加鸿蒙托盘适配注释

#### `src/main/services/KnowledgeService.ts`
- **改动内容**: 知识库服务适配
- **具体修改**:
  - 注释掉 LibSQL 相关导入：`// import { LibSqlDb } from '@cherrystudio/embedjs-libsql'   // 鸿蒙如果libsql未适配一直注释`
  - 为鸿蒙平台预留知识库存储适配
  - 注释掉向量数据库设置：`// .setVectorDatabase(new LibSqlDb({ path: path.join(this.storageDir, id) }))  // 鸿蒙如果libsql未适配一直注释`

#### `src/main/services/MCPService.ts`
- **改动内容**: MCP服务适配
- **具体修改**:
  - 优化服务初始化流程
  - 添加鸿蒙平台兼容性处理
  - 添加鸿蒙路径适配注释
  - 根据版本判断是否为鸿蒙系统，鸿蒙系统目前不支持stdio npx
  - 在 `getInstallInfo()` 方法中添加鸿蒙路径适配
  - 在 `getLoginShellEnv()` 方法中添加鸿蒙路径适配
  - 为鸿蒙系统提供特殊的二进制文件路径处理

#### `src/main/services/WindowService.ts`
- **改动内容**: 窗口服务鸿蒙适配
- **具体修改**:
  - 添加鸿蒙平台检测：`if(process.platform == 'ohos'){  //目前判断是否是鸿蒙`
  - 为鸿蒙平台设置窗口按钮可见性：`this.mainWindow.setWindowButtonVisibility(true)`

#### `src/main/utils/file.ts`
- **改动内容**: 文件工具鸿蒙路径适配
- **具体修改**:
  - 在 `getConfigDir()` 函数中添加鸿蒙路径判断：`//根据版本判断是否为鸿蒙系统，鸿蒙系统路径有区别`
  - 鸿蒙系统使用特殊路径：`path.join('/data/storage/el1/base/', '.cherrystudio', 'config')`

#### `src/main/utils/process.ts`
- **改动内容**: 进程工具鸿蒙适配
- **具体修改**:
  - 在 `getBinaryPath()` 函数中添加鸿蒙路径判断：`//根据版本判断是否为鸿蒙系统，鸿蒙系统路径有区别`
  - 鸿蒙系统使用特殊二进制路径：`path.join('/data/storage/el1/base/', '.cherrystudio', 'bin')`

### 2. 渲染进程文件 (`src/renderer/src/`)

#### `src/renderer/src/aiCore/clients/ApiClientFactory.ts`
- **改动内容**: API客户端工厂适配本地大模型
- **具体修改**:
  - 添加鸿蒙本地大模型支持：`provider.id === 'localLargeModel'`
  - 使用 `OllamaApiClient` 作为本地大模型客户端
  - 添加详细的日志输出用于调试
  - 添加鸿蒙本地大模型代码注释

#### `src/renderer/src/config/providers.ts`
- **改动内容**: 添加鸿蒙本地大模型提供商配置
- **具体修改**:
  - 导入鸿蒙本地大模型图标：`import localLargeModelLogo from '@renderer/assets/images/providers/ohos.png'`
  - 在 `PROVIDER_LOGO_MAP` 中添加 `localLargeModel: localLargeModelLogo`
  - 为鸿蒙平台提供本地大模型支持
  - 添加鸿蒙本地大模型注释

#### `src/renderer/src/config/models.ts`
- **改动内容**: 模型配置适配
- **具体修改**:
  - 添加鸿蒙本地大模型相关配置：`localLargeModel: [],  // 鸿蒙本地大模型`
  - 优化模型检测和分类逻辑

#### `src/renderer/src/config/constant.ts`
- **改动内容**: 常量配置鸿蒙适配
- **具体修改**:
  - 在平台检测中添加鸿蒙支持：`export const isWindows = platform === 'win32' || platform === 'win64' || platform === 'ohos'`
  - 确保鸿蒙平台被正确识别为Windows类型平台

#### `src/renderer/src/hooks/useAppInit.ts`
- **改动内容**: 应用初始化适配
- **具体修改**:
  - 注释掉自动更新功能：`// 适配鸿蒙，将更新隐藏`
  - 移除更新相关的 useEffect
  - 保留核心功能初始化

#### `src/renderer/src/hooks/useMinapps.ts`
- **改动内容**: 小程序功能适配
- **具体修改**:
  - 添加鸿蒙平台特定的小程序过滤：`const disabledMinappsIds = ['openai', 'baidu-ai-chat', 'baidu-ai-search']`
  - 隐藏不兼容的小程序（百度AI聊天、百度AI搜索、OpenAI）
  - 确保鸿蒙平台只显示兼容的小程序
  - 添加鸿蒙隐藏百度小程序和ChatGPT小程序注释

#### `src/renderer/src/pages/settings/AssistantSettings/index.tsx`
- **改动内容**: 助手设置界面适配
- **具体修改**:
  - 注释掉知识库选项卡：`// showKnowledgeIcon && { key: 'knowledge_base', label: t('assistants.settings.knowledge_base') }`
  - 简化设置界面，隐藏鸿蒙暂不支持的功能

#### `src/renderer/src/pages/settings/ProviderSettings/ProviderSetting.tsx`
- **改动内容**: 提供商设置界面适配
- **具体修改**:
  - 优化提供商配置显示
  - 添加鸿蒙本地大模型提供商支持
  - 确保设置界面在鸿蒙平台正常工作
  - 添加鸿蒙本地大模型代码注释

#### `src/renderer/src/pages/home/Inputbar/MCPToolsButton.tsx`
- **改动内容**: MCP工具按钮鸿蒙适配
- **具体修改**:
  - 添加鸿蒙stdio服务器过滤：`// 过滤掉鸿蒙内stdio服务器`
  - 优化MCP服务器选择逻辑，确保鸿蒙平台兼容性

#### `src/renderer/src/store/llm.ts`
- **改动内容**: LLM状态管理鸿蒙适配
- **具体修改**:
  - 注释掉本地大模型默认配置：`// 隐藏本地大模型`
  - 为鸿蒙平台预留本地大模型配置空间

#### `src/renderer/src/services/ApiService.ts`
- **改动内容**: API服务鸿蒙适配
- **具体修改**:
  - 在 `hasApiKey()` 函数中添加本地大模型支持：`provider.id === 'localLargeModel'`
  - 在 `checkApiProvider()` 函数中添加本地大模型检查
  - 确保本地大模型不需要API密钥验证

#### `src/renderer/src/i18n/locales/zh-cn.json`
- **改动内容**: 国际化文件鸿蒙适配
- **具体修改**:
  - 添加本地大模型中文翻译：`"localLargeModel": "本地大模型"`
  - 确保界面显示正确的本地大模型名称

#### `src/renderer/src/aiCore/clients/openai/OllamaApiClient.ts`
- **改动内容**: Ollama API客户端鸿蒙适配
- **具体修改**:
  - 添加本地大模型会话存储管理：`sessionStorage.getItem('localLargeModel')`
  - 实现模型切换逻辑，确保本地大模型正确加载和切换
  - 为鸿蒙平台提供完整的本地大模型支持

### 3. 资源文件 (`resources/`)

#### `resources/scripts/install-bun.js`
- **改动内容**: Bun安装脚本鸿蒙适配
- **具体修改**:
  - 添加鸿蒙系统路径判断：`//根据版本判断是否为鸿蒙系统，鸿蒙系统路径有区别`

#### `resources/scripts/install-uv.js`
- **改动内容**: UV安装脚本鸿蒙适配
- **具体修改**:
  - 添加鸿蒙系统路径判断：`//根据版本判断是否为鸿蒙系统，鸿蒙系统路径有区别`

### 4. 文档文件 (`docs/`)

#### `docs/README.zh.md`
- **改动内容**: 文档更新
- **具体修改**:
  - 添加鸿蒙版本说明：`- 鸿蒙版本 (PC)`

export async function cmdOnboard(): Promise<void> {
  const { ConfigManager } = await import('../../core/config/config.js')
  const cm = new ConfigManager()

  if (await cm.exists()) {
    const { runReconfigure } = await import('../../core/setup/index.js')
    await runReconfigure(cm)
  } else {
    const { PLUGINS_DATA_DIR, REGISTRY_PATH } = await import('../../core/config/config.js')
    const { SettingsManager } = await import('../../core/plugin/settings-manager.js')
    const { PluginRegistry } = await import('../../core/plugin/plugin-registry.js')
    const settingsManager = new SettingsManager(PLUGINS_DATA_DIR)
    const pluginRegistry = new PluginRegistry(REGISTRY_PATH)
    await pluginRegistry.load()

    const { runSetup } = await import('../../core/setup/index.js')
    await runSetup(cm, { skipRunMode: true, settingsManager, pluginRegistry })
  }
}

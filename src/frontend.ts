// @ts-nocheck — types are provided by Lumiverse at runtime

// ============================================================================
// Image Auto Generation — Frontend Settings Panel
// ============================================================================

type InsertType = 'disabled' | 'inline' | 'new' | 'replace'

interface PromptInjection {
  enabled: boolean
  prompt: string
  regex: string
  position: 'system' | 'user' | 'assistant'
  depth: number
}

interface ExtensionSettings {
  insertType: InsertType
  promptInjection: PromptInjection
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  insertType: 'inline',
  promptInjection: {
    enabled: true,
    prompt: `<image_generation>
You must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.
</image_generation>`,
    regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
    position: 'system',
    depth: 0,
  },
}

let currentSettings: ExtensionSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))

export function setup(ctx: SpindleFrontendContext) {
  // ─── Styles ──────────────────────────────────────────────────────────────

  const removeStyle = ctx.dom.addStyle(`
    .lv-iag-panel {
      padding: 16px;
      font-family: var(--lumiverse-font-sans, system-ui, sans-serif);
      color: var(--lumiverse-text);
      max-width: 480px;
    }
    .lv-iag-panel h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--lumiverse-text);
    }
    .lv-iag-section {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--lumiverse-fill-subtle, rgba(0,0,0,0.03));
      border-radius: 8px;
      border: 1px solid var(--lumiverse-border, rgba(0,0,0,0.08));
    }
    .lv-iag-section-title {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 10px 0;
      color: var(--lumiverse-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .lv-iag-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      gap: 10px;
    }
    .lv-iag-row:last-child {
      margin-bottom: 0;
    }
    .lv-iag-row label {
      font-size: 13px;
      font-weight: 500;
      min-width: 100px;
      flex-shrink: 0;
    }
    .lv-iag-row select,
    .lv-iag-row input[type="number"] {
      flex: 1;
      padding: 6px 10px;
      font-size: 13px;
      border: 1px solid var(--lumiverse-border);
      border-radius: 6px;
      background: var(--lumiverse-fill);
      color: var(--lumiverse-text);
      outline: none;
    }
    .lv-iag-row select:focus,
    .lv-iag-row input:focus,
    .lv-iag-textarea:focus {
      border-color: var(--lumiverse-primary, #6366f1);
    }
    .lv-iag-checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .lv-iag-checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--lumiverse-primary, #6366f1);
      cursor: pointer;
    }
    .lv-iag-textarea {
      width: 100%;
      padding: 8px 10px;
      font-size: 12px;
      font-family: var(--lumiverse-font-mono, monospace);
      border: 1px solid var(--lumiverse-border);
      border-radius: 6px;
      background: var(--lumiverse-fill);
      color: var(--lumiverse-text);
      resize: vertical;
      outline: none;
      box-sizing: border-box;
    }
    .lv-iag-hint {
      font-size: 11px;
      color: var(--lumiverse-text-muted);
      margin-top: 4px;
      line-height: 1.4;
    }
    .lv-iag-buttons {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    .lv-iag-btn {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .lv-iag-btn:hover {
      opacity: 0.85;
    }
    .lv-iag-btn-primary {
      background: var(--lumiverse-primary, #6366f1);
      color: white;
    }
    .lv-iag-btn-secondary {
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      border: 1px solid var(--lumiverse-border);
    }
    .lv-iag-status {
      font-size: 11px;
      padding: 6px 10px;
      border-radius: 6px;
      margin-top: 12px;
      display: none;
    }
    .lv-iag-status.visible {
      display: block;
    }
    .lv-iag-status.success {
      background: rgba(34, 197, 94, 0.15);
      color: #16a34a;
    }
    .lv-iag-status.error {
      background: rgba(239, 68, 68, 0.15);
      color: #dc2626;
    }
  `)

  // ─── Build UI ────────────────────────────────────────────────────────────

  ctx.dom.inject('body', `
    <div class="lv-iag-panel">
      <h3>🎨 Image Auto Generation</h3>

      <div class="lv-iag-section">
        <div class="lv-iag-section-title">Generation Mode</div>
        <div class="lv-iag-row">
          <label for="lv-iag-insert-type">Insert Mode</label>
          <select id="lv-iag-insert-type">
            <option value="inline">Inline (append to message)</option>
            <option value="replace">Replace (swap &lt;pic&gt; tags)</option>
            <option value="new">New Message</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div class="lv-iag-hint">
          <strong>Inline</strong>: Appends images to the current message.<br>
          <strong>Replace</strong>: Replaces &lt;pic&gt; tags with images inline.<br>
          <strong>New</strong>: Creates a separate message for each image.
        </div>
      </div>

      <div class="lv-iag-section">
        <div class="lv-iag-section-title">Prompt Injection</div>
        <div class="lv-iag-row">
          <label class="lv-iag-checkbox-label">
            <input type="checkbox" id="lv-iag-injection-enabled">
            <span>Enable Prompt Injection</span>
          </label>
        </div>
        <div class="lv-iag-row" style="flex-direction: column; align-items: stretch;">
          <label style="margin-bottom: 4px;">Prompt Template</label>
          <textarea id="lv-iag-prompt-text" class="lv-iag-textarea" rows="4" placeholder="Prompt that instructs the AI to generate image tags..."></textarea>
          <div class="lv-iag-hint">This prompt is injected into the conversation to tell the AI to use &lt;pic&gt; tags.</div>
        </div>
        <div class="lv-iag-row" style="flex-direction: column; align-items: stretch; margin-top: 10px;">
          <label style="margin-bottom: 4px;">Regex Pattern</label>
          <textarea id="lv-iag-regex" class="lv-iag-textarea" rows="2" placeholder="Regex to match <pic> tags..."></textarea>
          <div class="lv-iag-hint">Default: matches &lt;pic prompt="..."&gt; tags. Capture group 1 = the prompt.</div>
        </div>
        <div class="lv-iag-row" style="margin-top: 10px;">
          <label for="lv-iag-position">Position</label>
          <select id="lv-iag-position">
            <option value="system">System</option>
            <option value="user">User</option>
            <option value="assistant">Assistant</option>
          </select>
        </div>
        <div class="lv-iag-row">
          <label for="lv-iag-depth">Depth</label>
          <input id="lv-iag-depth" type="number" min="0" max="100" value="0">
        </div>
        <div class="lv-iag-hint">Depth 0 = end of context. Higher = deeper in history.</div>
      </div>

      <div class="lv-iag-section">
        <div class="lv-iag-section-title">Multi-Image Setup (Optional)</div>
        <div class="lv-iag-hint" style="font-size: 11px;">
          To generate multiple images per reply, customize the prompt template to instruct the AI to insert multiple &lt;pic&gt; tags. Adjust the regex accordingly.
        </div>
      </div>

      <div class="lv-iag-buttons">
        <button id="lv-iag-save" class="lv-iag-btn lv-iag-btn-primary">Save Settings</button>
        <button id="lv-iag-reset" class="lv-iag-btn lv-iag-btn-secondary">Reset to Defaults</button>
      </div>

      <div id="lv-iag-status" class="lv-iag-status"></div>
    </div>
  `)

  // ─── Element References ──────────────────────────────────────────────────

  const insertTypeEl = ctx.dom.query('#lv-iag-insert-type') as HTMLSelectElement
  const injectionEnabledEl = ctx.dom.query('#lv-iag-injection-enabled') as HTMLInputElement
  const promptTextEl = ctx.dom.query('#lv-iag-prompt-text') as HTMLTextAreaElement
  const regexEl = ctx.dom.query('#lv-iag-regex') as HTMLTextAreaElement
  const positionEl = ctx.dom.query('#lv-iag-position') as HTMLSelectElement
  const depthEl = ctx.dom.query('#lv-iag-depth') as HTMLInputElement
  const saveBtn = ctx.dom.query('#lv-iag-save') as HTMLButtonElement
  const resetBtn = ctx.dom.query('#lv-iag-reset') as HTMLButtonElement
  const statusEl = ctx.dom.query('#lv-iag-status') as HTMLDivElement

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function showStatus(message: string, type: 'success' | 'error' = 'success') {
    if (!statusEl) return
    statusEl.textContent = message
    statusEl.className = `lv-iag-status visible ${type}`
    setTimeout(() => {
      statusEl.classList.remove('visible')
    }, 3000)
  }

  function updateUIFromSettings(settings: ExtensionSettings) {
    if (insertTypeEl) insertTypeEl.value = settings.insertType
    if (injectionEnabledEl) injectionEnabledEl.checked = settings.promptInjection.enabled
    if (promptTextEl) promptTextEl.value = settings.promptInjection.prompt
    if (regexEl) regexEl.value = settings.promptInjection.regex
    if (positionEl) positionEl.value = settings.promptInjection.position
    if (depthEl) depthEl.value = String(settings.promptInjection.depth)
  }

  function collectSettingsFromUI(): ExtensionSettings {
    return {
      insertType: (insertTypeEl?.value as InsertType) || 'disabled',
      promptInjection: {
        enabled: injectionEnabledEl?.checked ?? true,
        prompt: promptTextEl?.value || DEFAULT_SETTINGS.promptInjection.prompt,
        regex: regexEl?.value || DEFAULT_SETTINGS.promptInjection.regex,
        position: (positionEl?.value as 'system' | 'user' | 'assistant') || 'system',
        depth: parseInt(depthEl?.value || '0', 10) || 0,
      },
    }
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────

  function handleSave() {
    const newSettings = collectSettingsFromUI()
    currentSettings = newSettings
    ctx.sendToBackend({
      type: 'update_settings',
      patch: newSettings,
    })
  }

  function handleReset() {
    ctx.sendToBackend({ type: 'reset_settings' })
  }

  if (saveBtn) saveBtn.addEventListener('click', handleSave)
  if (resetBtn) resetBtn.addEventListener('click', handleReset)

  // ─── Backend Communication ───────────────────────────────────────────────

  const unsubBackend = ctx.onBackendMessage((payload: any) => {
    switch (payload.type) {
      case 'settings_loaded':
        if (payload.settings) {
          currentSettings = payload.settings
          updateUIFromSettings(currentSettings)
        }
        break

      case 'settings_updated':
        if (payload.settings) {
          currentSettings = payload.settings
          updateUIFromSettings(currentSettings)
          showStatus('Settings saved successfully!', 'success')
        }
        break

      case 'settings_reset':
        if (payload.settings) {
          currentSettings = payload.settings
          updateUIFromSettings(currentSettings)
          showStatus('Settings reset to defaults!', 'success')
        }
        break

      case 'error':
        showStatus(`Error: ${payload.message || 'Unknown error'}`, 'error')
        break

      default:
        break
    }
  })

  // ─── Request Initial Settings ────────────────────────────────────────────

  ctx.sendToBackend({ type: 'get_settings' })

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  return () => {
    unsubBackend()
    removeStyle()
    ctx.dom.cleanup()
  }
}
// @ts-nocheck — spindle global and types are provided by Lumiverse at runtime

// ============================================================================
// Image Auto Generation for Lumiverse
// Ported from SillyTavern: https://github.com/wickedcode01/st-image-auto-generation
// ============================================================================

// ─── Constants ──────────────────────────────────────────────────────────────

const EXTENSION_NAME = 'lv_image_auto_generation'
const SETTINGS_FILE = 'settings.json'

const INSERT_TYPE = {
  DISABLED: 'disabled',
  INLINE: 'inline',
  NEW_MESSAGE: 'new',
  REPLACE: 'replace',
} as const

type InsertType = (typeof INSERT_TYPE)[keyof typeof INSERT_TYPE]

interface ExtensionSettings {
  insertType: InsertType
  promptInjection: {
    enabled: boolean
    prompt: string
    regex: string
    position: 'system' | 'user' | 'assistant'
    depth: number
  }
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  insertType: INSERT_TYPE.INLINE,
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

// ─── State ──────────────────────────────────────────────────────────────────

let settings: ExtensionSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
let interceptorRegistered = false

// Track which messages we've already processed to avoid duplicates
const processedMessageIds = new Set<string>()

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Load settings from persistent storage
 */
async function loadSettings(): Promise<void> {
  try {
    const stored = await spindle.userStorage.getJson<ExtensionSettings>(SETTINGS_FILE, {
      fallback: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    })
    // Merge with defaults to ensure all fields exist
    settings = mergeWithDefaults(stored)
    spindle.log.info(`[${EXTENSION_NAME}] Settings loaded`)
  } catch (err) {
    spindle.log.warn(`[${EXTENSION_NAME}] Failed to load settings, using defaults:`, String(err))
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }
}

/**
 * Save settings to persistent storage
 */
async function saveSettings(): Promise<void> {
  try {
    await spindle.userStorage.setJson(SETTINGS_FILE, settings)
  } catch (err) {
    spindle.log.error(`[${EXTENSION_NAME}] Failed to save settings:`, String(err))
  }
}

/**
 * Merge stored settings with defaults to handle missing fields
 */
function mergeWithDefaults(stored: Partial<ExtensionSettings>): ExtensionSettings {
  return {
    insertType: stored.insertType ?? DEFAULT_SETTINGS.insertType,
    promptInjection: {
      enabled: stored.promptInjection?.enabled ?? DEFAULT_SETTINGS.promptInjection.enabled,
      prompt: stored.promptInjection?.prompt ?? DEFAULT_SETTINGS.promptInjection.prompt,
      regex: stored.promptInjection?.regex ?? DEFAULT_SETTINGS.promptInjection.regex,
      position: stored.promptInjection?.position ?? DEFAULT_SETTINGS.promptInjection.position,
      depth: stored.promptInjection?.depth ?? DEFAULT_SETTINGS.promptInjection.depth,
    },
  }
}

/**
 * Parse a regex string in the format "/pattern/flags" into a RegExp object
 */
function regexFromString(regexStr: string): RegExp {
  const match = regexStr.match(/^\/(.*)\/([gimuy]*)$/)
  if (!match) {
    // If not in /pattern/flags format, treat as a literal string pattern
    return new RegExp(regexStr, 'g')
  }
  return new RegExp(match[1]!, match[2] || 'g')
}

/**
 * Escape HTML attribute values
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Prompt Injection (Interceptor) ─────────────────────────────────────────

function registerPromptInterceptor(): void {
  if (interceptorRegistered) return
  if (!spindle.permissions.has('interceptor')) {
    spindle.log.warn(`[${EXTENSION_NAME}] Cannot register interceptor: permission not granted`)
    return
  }

  spindle.registerInterceptor(async (messages, context) => {
    // Skip if disabled
    if (settings.insertType === INSERT_TYPE.DISABLED) {
      return messages
    }

    // Skip if prompt injection is disabled
    if (!settings.promptInjection.enabled) {
      return messages
    }

    const prompt = settings.promptInjection.prompt
    const depth = settings.promptInjection.depth ?? 0
    const position = settings.promptInjection.position ?? 'system'

    if (!prompt.trim()) {
      return messages
    }

    spindle.log.info(`[${EXTENSION_NAME}] Injecting image generation prompt (role=${position}, depth=${depth})`)

    // Determine the role to use
    const role = position as 'system' | 'user' | 'assistant'

    // Inject the prompt at the specified position
    if (depth === 0) {
      // Add to the end
      return [...messages, { role, content: prompt }]
    } else {
      // Insert from the end (but not past the beginning)
      const insertIndex = Math.max(0, messages.length - depth)
      const before = messages.slice(0, insertIndex)
      const after = messages.slice(insertIndex)
      return [...before, { role, content: prompt }, ...after]
    }
  }, 100) // priority 100 = default position

  interceptorRegistered = true
  spindle.log.info(`[${EXTENSION_NAME}] Prompt interceptor registered`)
}

// ─── Message Processing ─────────────────────────────────────────────────────

/**
 * Process an assistant message to detect <pic> tags and generate images
 */
async function processAssistantMessage(chatId: string, messageId: string, content: string): Promise<void> {
  // Skip if disabled
  if (settings.insertType === INSERT_TYPE.DISABLED) {
    return
  }

  // Skip if already processed
  if (processedMessageIds.has(messageId)) {
    return
  }
  processedMessageIds.add(messageId)

  // Limit cache size to prevent memory leaks
  if (processedMessageIds.size > 1000) {
    const toDelete = Array.from(processedMessageIds).slice(0, 500)
    for (const id of toDelete) {
      processedMessageIds.delete(id)
    }
  }

  // Parse the regex
  let regex: RegExp
  try {
    regex = regexFromString(settings.promptInjection.regex)
  } catch (err) {
    spindle.log.error(`[${EXTENSION_NAME}] Invalid regex:`, String(err))
    spindle.toast.error(`Invalid regex pattern: ${String(err)}`)
    return
  }

  // Find all <pic> tags
  let matches: RegExpMatchArray[]
  if (regex.global) {
    matches = [...content.matchAll(regex)]
  } else {
    const singleMatch = content.match(regex)
    matches = singleMatch ? [singleMatch] : []
  }

  if (matches.length === 0) {
    return
  }

  spindle.log.info(`[${EXTENSION_NAME}] Found ${matches.length} image tag(s) in message`)
  spindle.toast.info(`Generating ${matches.length} image(s)...`)

  const insertType = settings.insertType

  try {
    // Process each match and collect images
    const generatedImages: { prompt: string; imageUrl: string }[] = []

    for (const match of matches) {
      const prompt = typeof match[1] === 'string' ? match[1] : ''
      if (!prompt.trim()) {
        continue
      }

      spindle.log.info(`[${EXTENSION_NAME}] Generating image: ${prompt.slice(0, 50)}...`)

      // Check if we have image_gen permission
      if (!spindle.permissions.has('image_gen')) {
        spindle.toast.warning('Image generation permission not granted. Enable it in Extensions panel.')
        return
      }

      // Generate the image using Lumiverse's image generation API
      const result = await spindle.imageGen.generate({
        prompt: prompt.trim(),
      })

      spindle.log.info(`[${EXTENSION_NAME}] Image generated via ${result.provider} (${result.model})`)

      if (result.imageUrl || result.imageDataUrl) {
        const imageUrl = result.imageUrl ?? result.imageDataUrl
        generatedImages.push({ prompt, imageUrl })
      }
    }

    if (generatedImages.length === 0) {
      spindle.toast.warning('No images were generated')
      return
    }

    // Apply based on insert type
    switch (insertType) {
      case INSERT_TYPE.INLINE:
        await handleInlineInsert(chatId, messageId, content, generatedImages, matches)
        break
      case INSERT_TYPE.REPLACE:
        await handleReplaceInsert(chatId, messageId, content, generatedImages, matches)
        break
      case INSERT_TYPE.NEW_MESSAGE:
        await handleNewMessageInsert(chatId, generatedImages)
        break
    }

    spindle.toast.success(`${generatedImages.length} image(s) generated successfully`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    spindle.log.error(`[${EXTENSION_NAME}] Image generation error:`, errMsg)
    spindle.toast.error(`Image generation error: ${errMsg}`)
  }
}

/**
 * INLINE mode: Add images to the existing message content as markdown images
 */
async function handleInlineInsert(
  chatId: string,
  messageId: string,
  originalContent: string,
  images: { prompt: string; imageUrl: string }[],
  _matches: RegExpMatchArray[],
): Promise<void> {
  // Build updated content with images appended
  let newContent = originalContent

  for (const img of images) {
    const escapedPrompt = escapeHtmlAttribute(img.prompt)
    // Use markdown image syntax - Lumiverse should render this
    newContent += `\n\n![${escapedPrompt}](${img.imageUrl})`
  }

  await spindle.chat.updateMessage(chatId, messageId, {
    content: newContent,
    metadata: { image_auto_generated: true, image_count: images.length },
  })

  spindle.log.info(`[${EXTENSION_NAME}] Images inserted inline into message ${messageId}`)
}

/**
 * REPLACE mode: Replace <pic> tags with <img> tags in the message content
 */
async function handleReplaceInsert(
  chatId: string,
  messageId: string,
  originalContent: string,
  images: { prompt: string; imageUrl: string }[],
  matches: RegExpMatchArray[],
): Promise<void> {
  let newContent = originalContent
  let imageIndex = 0

  for (const match of matches) {
    const originalTag = typeof match[0] === 'string' ? match[0] : ''
    if (!originalTag || imageIndex >= images.length) {
      continue
    }

    const img = images[imageIndex]!
    const escapedUrl = escapeHtmlAttribute(img.imageUrl)
    const escapedPrompt = escapeHtmlAttribute(img.prompt)
    const newImageTag = `<img src="${escapedUrl}" title="${escapedPrompt}" alt="${escapedPrompt}" style="max-width:100%;border-radius:8px;">`

    newContent = newContent.replace(originalTag, newImageTag)
    imageIndex++
  }

  await spindle.chat.updateMessage(chatId, messageId, {
    content: newContent,
    metadata: { image_auto_generated: true, image_count: images.length },
  })

  spindle.log.info(`[${EXTENSION_NAME}] Tags replaced with images in message ${messageId}`)
}

/**
 * NEW mode: Create new assistant messages with the images
 */
async function handleNewMessageInsert(
  chatId: string,
  images: { prompt: string; imageUrl: string }[],
): Promise<void> {
  for (const img of images) {
    const escapedPrompt = escapeHtmlAttribute(img.prompt)
    const content = `![${escapedPrompt}](${img.imageUrl})`

    await spindle.chat.appendMessage(chatId, {
      role: 'assistant',
      content,
      metadata: { image_auto_generated: true, is_image_message: true },
    })
  }

  spindle.log.info(`[${EXTENSION_NAME}] Created ${images.length} new message(s) with images`)
}

// ─── Event Listeners ────────────────────────────────────────────────────────

function setupEventListeners(): void {
  // Listen for new assistant messages
  spindle.on('MESSAGE_SENT', (payload: unknown) => {
    const p = payload as { chatId?: string; message?: { id?: string; role?: string; content?: string } } | null
    if (!p?.chatId || !p.message?.id) return

    const { chatId, message } = p
    const { id: messageId, role, content } = message

    // Only process assistant messages with content
    if (role === 'assistant' && content && messageId) {
      // Process asynchronously - don't block the event
      void processAssistantMessage(chatId, messageId, content)
    }
  })

  // Listen for message edits (in case user edits and adds pic tags)
  spindle.on('MESSAGE_EDITED', (payload: unknown) => {
    const p = payload as { chatId?: string; message?: { id?: string; role?: string; content?: string } } | null
    if (!p?.chatId || !p.message?.id) return

    const { chatId, message } = p
    const { id: messageId, role, content } = message

    // Remove from processed set so we re-process edited messages
    if (messageId) {
      processedMessageIds.delete(messageId)
    }

    if (role === 'assistant' && content && messageId) {
      void processAssistantMessage(chatId, messageId, content)
    }
  })

  // Listen for generation end to clean up tracking if needed
  spindle.on('GENERATION_ENDED', (_payload: unknown) => {
    // Optional: could do cleanup here
  })
}

// ─── Frontend Communication ─────────────────────────────────────────────────

function setupFrontendCommunication(): void {
  spindle.onFrontendMessage(async (payload: any, userId) => {
    switch (payload.type) {
      case 'get_settings': {
        spindle.sendToFrontend({
          type: 'settings_loaded',
          settings,
        }, userId)
        break
      }

      case 'update_settings': {
        if (payload.patch) {
          settings = mergeWithDefaults({
            ...settings,
            ...payload.patch,
            promptInjection: {
              ...settings.promptInjection,
              ...(payload.patch.promptInjection || {}),
            },
          })
          await saveSettings()
          spindle.sendToFrontend({
            type: 'settings_updated',
            settings,
          }, userId)
          spindle.log.info(`[${EXTENSION_NAME}] Settings updated`)
        }
        break
      }

      case 'reset_settings': {
        settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
        await saveSettings()
        spindle.sendToFrontend({
          type: 'settings_reset',
          settings,
        }, userId)
        spindle.log.info(`[${EXTENSION_NAME}] Settings reset to defaults`)
        break
      }

      default:
        break
    }
  })
}

// ─── Init ───────────────────────────────────────────────────────────────────

;(async () => {
  await loadSettings()
  registerPromptInterceptor()
  setupEventListeners()
  setupFrontendCommunication()
  spindle.log.info(`[${EXTENSION_NAME}] Extension loaded (insertType: ${settings.insertType})`)
})()

export {}
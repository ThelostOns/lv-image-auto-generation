# Image Auto Generation for Lumiverse

A Lumiverse extension that automatically generates images when AI messages contain `<pic prompt="...">` tags. Ported from the [SillyTavern Image Auto Generation](https://github.com/wickedcode01/st-image-auto-generation) plugin.

## Features

- **Prompt Injection**: Automatically injects instructions into the conversation context telling the AI to generate image tags
- **Auto Image Generation**: Detects `<pic prompt="...">` tags in AI responses and generates images automatically
- **Multiple Insert Modes**:
  - **Inline**: Appends generated images to the current AI message
  - **Replace**: Replaces `<pic>` tags directly with rendered images in the message
  - **New Message**: Creates separate assistant messages for each generated image
- **Customizable**: Configure the injection prompt, regex pattern, position, and depth
- **Multi-image Support**: Generate multiple images per reply with custom regex patterns

## Requirements

- Lumiverse v0.1.0 or later
- An image generation connection profile configured in Lumiverse (NovelAI, NanoGPT, Google Gemini, etc.)

## Installation

1. Go to **Extensions** panel in Lumiverse
2. Click **Install from GitHub**
3. Paste this repository URL: `https://github.com/yourusername/lv-image-auto-generation`
4. Grant the requested permissions:
   - **Interceptor** — to inject image generation prompts into the context
   - **Chat Mutation** — to read messages and insert generated images
   - **Image Gen** — to generate images via your configured connection

## Usage

1. Configure your image generation connection in Lumiverse settings
2. Install and enable this extension
3. Open the extension's settings panel to configure:
   - **Insert Mode**: How generated images should appear
   - **Prompt Template**: The system prompt injected to instruct the AI
   - **Regex**: Pattern to extract image prompts from AI responses
   - **Position**: Where to inject the prompt (system/user/assistant)
4. Start chatting! The AI will automatically include `<pic prompt="...">` tags in responses
5. Images will be generated and inserted based on your chosen mode

## Settings

| Setting | Description |
|---------|-------------|
| **Insert Mode** | How images appear: Inline (append), Replace (swap tags), New Message, or Disabled |
| **Enable Prompt Injection** | Whether to inject the image generation instruction into the prompt |
| **Prompt Template** | The system message that tells the AI to use `<pic>` tags |
| **Regex** | Pattern to find `<pic prompt="...">` tags (capture group 1 = the prompt) |
| **Position** | Role for the injected prompt: system, user, or assistant |
| **Depth** | Where to insert: 0 = end of context, higher = deeper in history |

## Multi-Image Setup

To generate multiple images per reply, customize the prompt template:

**Prompt Template:**
```
<image_generation>You must insert at most three <pic prompt="example prompt"> in the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.</image_generation>
```

**Regex:**
```
/<pic[^>]*\sprompt="([^"]*)"[^>]*?>/g
```

## How It Works

1. **Before generation**: The extension uses a prompt interceptor to inject an instruction telling the AI to include `<pic prompt="description">` tags in its response
2. **After generation**: When the AI's message is sent, the extension scans for `<pic>` tags using the configured regex
3. **Image generation**: For each matched tag, it extracts the prompt and calls Lumiverse's image generation API
4. **Insertion**: Based on the insert mode, images are either appended to the message, replace the tags inline, or created as new messages

## API Mapping (SillyTavern → Lumiverse)

| SillyTavern | Lumiverse |
|-------------|-----------|
| `CHAT_COMPLETION_PROMPT_READY` | `spindle.registerInterceptor()` |
| `MESSAGE_RECEIVED` | `spindle.on('MESSAGE_SENT')` |
| `/sd` slash command | `spindle.imageGen.generate()` |
| `extension_settings` | `spindle.userStorage` |
| `toastr.info/success/error` | `spindle.toast.info/success/error` |
| `getContext().chat[]` | `spindle.chat.getMessages()` |
| `appendMediaToMessage()` | `spindle.chat.updateMessage()` |
| `updateMessageBlock()` | `spindle.chat.updateMessage()` |

## License

This port maintains the same license as the original project. See [LICENSE](LICENSE) for details.

## Credits

- Original [SillyTavern Image Auto Generation](https://github.com/wickedcode01/st-image-auto-generation) by [wickedcode01](https://github.com/wickedcode01)
- Ported to [Lumiverse](https://github.com/prolix-oc/Lumiverse)
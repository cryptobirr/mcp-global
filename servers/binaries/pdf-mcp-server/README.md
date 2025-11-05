# Intelligent PDF MCP Server

A Model Context Protocol (MCP) server that provides **intelligent PDF text extraction** with automatic method detection for ANY PDF format.

## 🧠 **SMART EXTRACTION - AUTO-DETECTS OPTIMAL METHOD**

The server automatically analyzes each PDF and selects the best extraction method:
- **Text-based PDFs**: Fast native text extraction
- **Image-based/Scanned PDFs**: High-quality OCR processing
- **Hybrid Documents**: Combined extraction strategies

**Zero configuration required - just point it at any PDF file!**

## ✅ **TESTED & VALIDATED**

Successfully tested with complex, real-world PDF documents including:
- **94+ page business proposals** with images, charts, and formatted text
- **Technical architecture diagrams** with text overlays and complex layouts
- **Scanned documents** requiring OCR processing
- **Mixed content PDFs** with various formatting and embedded elements

**See [SMART_EXTRACTION_RESULTS.md](./SMART_EXTRACTION_RESULTS.md) for intelligent extraction results.**

## Features

- **🧠 Smart Auto-Detection**: Automatically analyzes PDFs and selects optimal extraction method
- **📄 Universal PDF Support**: Handles text-based, image-based, scanned, and hybrid documents
- **🔧 Multiple Extraction Methods**: pdf-parse, enhanced OCR (Tesseract), and intelligent fallbacks
- **📊 Document Analysis**: Provides detailed analysis of PDF type, confidence, and method selection
- **🎯 Zero Configuration**: No manual method selection required - works out of the box
- **⚡ Performance Optimized**: Automatically chooses fastest reliable method for each document
- **🛡️ Robust Error Handling**: Comprehensive error handling with intelligent fallback strategies
- **📋 Metadata Extraction**: Extracts PDF metadata including title, author, creation date, etc.

## Installation

```bash
npm install
npm run build
```

## Usage

### As an MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "pdf-mcp-server": {
      "command": "node",
      "args": ["/path/to/pdf-mcp-server/build/index.js"]
    }
  }
}
```

### Available Tools

#### 1. extract_pdf_text_smart ⭐ **RECOMMENDED**

Intelligently extracts text from ANY PDF format with automatic method detection.

**Parameters:**
- `file_path` (required): Path to the PDF file

**Example:**
```json
{
  "name": "extract_pdf_text_smart",
  "arguments": {
    "file_path": "/path/to/document.pdf"
  }
}
```

**Features:**
- 🧠 Automatic PDF analysis and method selection
- 📊 Detailed extraction report with confidence scores
- 🎯 Optimal performance for any PDF type
- 🔧 Zero configuration required

#### 2. extract_pdf_text (Advanced)

Extracts text from PDF files using specific methods (for advanced users).

**Parameters:**
- `file_path` (required): Path to the PDF file
- `methods` (optional): Array of methods to try ['pdf-parse', 'ocr', 'simple-ocr']
- `try_all_methods` (optional): Whether to try all methods even if one succeeds

**Example:**
```json
{
  "name": "extract_pdf_text",
  "arguments": {
    "file_path": "/path/to/document.pdf",
    "methods": ["pdf-parse", "simple-ocr"],
    "try_all_methods": false
  }
}
```

#### 3. get_pdf_metadata

Extracts metadata from PDF files.

**Parameters:**
- `file_path` (required): Path to the PDF file

**Example:**
```json
{
  "name": "get_pdf_metadata",
  "arguments": {
    "file_path": "/path/to/document.pdf"
  }
}
```

#### 4. export_markdown_to_pdf ⭐ **NEW**

Export a Markdown file to PDF with professional styling and syntax highlighting.

**Parameters:**
- `markdown_path` (required): Path to the Markdown file to convert to PDF. Use relative paths (e.g., "./file.md") or absolute paths. Relative paths are resolved from the current working directory.
- `output_path` (optional): Output path for the PDF file (defaults to same directory as markdown file). Use relative paths (e.g., "./output.pdf") or absolute paths. Relative paths are resolved from the current working directory.
- `format` (optional): Page format for the PDF (default: A4). Options: 'A4', 'Letter', 'Legal'
- `landscape` (optional): Whether to use landscape orientation (default: false)
- `margin_top`, `margin_bottom`, `margin_left`, `margin_right` (optional): Margins (default: 1in)

**Example:**
```json
{
  "name": "export_markdown_to_pdf",
  "arguments": {
    "markdown_path": "./document.md",
    "output_path": "./document.pdf",
    "format": "A4",
    "landscape": false
  }
}
```

**Features:**
- 🎨 Professional styling with syntax highlighting
- 📊 Mermaid diagram support
- 📄 High-quality PDF output with proper formatting
- 🔧 Customizable page format and margins

#### 5. export_markdown_content_to_pdf

Export Markdown content (as text) directly to PDF without requiring a file.

**Parameters:**
- `markdown_content` (required): Markdown content as a string to convert to PDF
- `output_path` (required): Output path for the PDF file. Use relative paths (e.g., "./output.pdf") or absolute paths. Relative paths are resolved from the current working directory.
- `format` (optional): Page format for the PDF (default: A4). Options: 'A4', 'Letter', 'Legal'
- `landscape` (optional): Whether to use landscape orientation (default: false)
- `margin_top`, `margin_bottom`, `margin_left`, `margin_right` (optional): Margins (default: 1in)

**Example:**
```json
{
  "name": "export_markdown_content_to_pdf",
  "arguments": {
    "markdown_content": "# My Document\n\nThis is **bold** text.",
    "output_path": "./output.pdf"
  }
}
```

## Path Handling

**Important**: The server now properly handles both relative and absolute paths:

- **Relative paths**: Use `./filename.ext` format - resolved from current working directory
- **Absolute paths**: Use full system paths - `/full/path/to/file.ext`
- **Path resolution**: All paths are properly resolved using Node.js `path.resolve()`

**Examples:**
```json
// Relative path (recommended)
"markdown_path": "./my-document.md"

// Absolute path
"markdown_path": "/Users/username/Documents/my-document.md"
```

## Extraction Methods

### 1. pdf-parse
- Fast and reliable for most standard PDFs
- Good for text-based PDFs with proper text layers

### 2. pdf.js
- Mozilla's PDF.js library
- Good fallback when pdf-parse fails
- Handles more complex PDF structures

### 3. OCR (Tesseract)
- Optical Character Recognition using Tesseract
- Converts PDF pages to images then extracts text
- Best for image-based PDFs or scanned documents
- Slower but most comprehensive

## Error Handling

The server automatically tries methods in order and provides detailed error messages if all methods fail. Each method's success/failure is tracked and reported.

## Dependencies

- `@modelcontextprotocol/sdk`: MCP SDK
- `pdf-parse`: Primary PDF text extraction
- `pdfjs-dist`: Mozilla PDF.js for fallback extraction
- `tesseract.js`: OCR capabilities
- `pdf2pic`: PDF to image conversion for OCR
- `canvas`: Required for image processing

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development with watch mode
npm run dev
```

## Testing

The server includes comprehensive testing with real-world PDF documents:

```bash
# Run the test script with sample PDFs
node test-pdf.js

# Test with your own PDF
node -e "
const testPdf = '/path/to/your/document.pdf';
// Test script validates extraction methods
"
```

### Validated PDF Types

✅ **Business Proposals**: Complex multi-page documents (94+ pages tested)
✅ **Technical Diagrams**: Architecture diagrams with text overlays
✅ **Image-based PDFs**: Documents with embedded images and text
✅ **Formatted Documents**: PDFs with tables, charts, and structured content

The server has been validated with documents from enterprise RFP processes, ensuring production-ready reliability.

## Troubleshooting

### Common Issues

1. **OCR not working**: Ensure you have the required system dependencies for canvas and image processing
2. **Permission errors**: Make sure the server has read access to the PDF files
3. **Memory issues**: Large PDFs with OCR can be memory intensive

### System Dependencies

For OCR functionality, you may need to install system dependencies:

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

## License

MIT
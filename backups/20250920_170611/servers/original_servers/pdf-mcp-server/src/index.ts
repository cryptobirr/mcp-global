#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { createWorker } from 'tesseract.js';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import hljs from 'highlight.js';
import mermaid from 'mermaid';

// Use require for modules without proper TypeScript support
const pdfParse = require('pdf-parse');
const pdf2pic = require('pdf2pic');

interface PDFExtractionResult {
  text: string;
  method: string;
  success: boolean;
  error?: string;
  metadata?: {
    pages: number;
    processedPages?: number;
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
    analysis?: string;
    recommendedMethod?: string;
    confidence?: number;
    pdfType?: string;
  };
}

interface PDFAnalysis {
  isTextBased: boolean;
  isImageBased: boolean;
  isHybrid: boolean;
  textQuality: 'high' | 'medium' | 'low' | 'none';
  recommendedMethod: string;
  confidence: number;
  analysis: string;
}

interface MarkdownToPDFResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  metadata?: {
    inputFile: string;
    outputFile: string;
    fileSize?: number;
    processingTime?: number;
    pageCount?: number;
  };
}

interface PDFExportOptions {
  format?: 'A4' | 'Letter' | 'Legal';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  landscape?: boolean;
  scale?: number;
}

class MarkdownToPDFExporter {
  private browser: any = null;

  async initializeBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async exportMarkdownToPDF(
    markdownPath: string,
    outputPath?: string,
    options: PDFExportOptions = {}
  ): Promise<MarkdownToPDFResult> {
    const startTime = Date.now();
    
    try {
      // Normalize path - resolve relative paths properly
      const resolvedMarkdownPath = path.resolve(markdownPath);
      
      // Validate input file exists
      if (!fs.existsSync(resolvedMarkdownPath)) {
        throw new Error(`Markdown file not found: ${markdownPath} (resolved to: ${resolvedMarkdownPath})`);
      }

      // Validate input file is markdown
      const ext = path.extname(resolvedMarkdownPath).toLowerCase();
      if (!['.md', '.markdown'].includes(ext)) {
        throw new Error(`File is not a Markdown file: ${markdownPath}`);
      }

      // Generate output path if not provided
      if (!outputPath) {
        const baseName = path.basename(resolvedMarkdownPath, ext);
        const dir = path.dirname(resolvedMarkdownPath);
        outputPath = path.join(dir, `${baseName}.pdf`);
      } else {
        // Resolve output path as well
        outputPath = path.resolve(outputPath);
      }

      // Read markdown content
      const markdownContent = fs.readFileSync(resolvedMarkdownPath, 'utf-8');

      // Configure marked with syntax highlighting
      marked.use({
        breaks: true,
        gfm: true,
        renderer: {
          code(code: string, lang?: string) {
            // Handle Mermaid diagrams
            if (lang === 'mermaid') {
              const diagramId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
              return `<div class="mermaid-container">
                        <div id="${diagramId}" class="mermaid">${code}</div>
                      </div>`;
            }
            
            // Handle regular code with syntax highlighting
            if (lang && hljs.getLanguage(lang)) {
              try {
                const highlighted = hljs.highlight(code, { language: lang }).value;
                return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
              } catch (err) {
                console.warn('Syntax highlighting failed:', err);
              }
            }
            const highlighted = hljs.highlightAuto(code).value;
            return `<pre><code class="hljs">${highlighted}</code></pre>`;
          }
        }
      });

      // Convert markdown to HTML
      const htmlContent = marked(markdownContent);

      // Create complete HTML document with styling
      const fullHtml = this.createStyledHTML(htmlContent);

      // Initialize browser
      await this.initializeBrowser();
      const page = await this.browser.newPage();
      
      // Set high DPI for better quality
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2
      });

      // Set content and wait for it to load
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      // Wait for Mermaid diagrams to render if they exist
      const hasMermaid = fullHtml.includes('class="mermaid"');
      if (hasMermaid) {
        try {
          // Wait for mermaid-ready class to be added (indicates diagrams are rendered)
          await page.waitForSelector('body.mermaid-ready', { timeout: 10000 });
        } catch (error) {
          console.warn('Mermaid rendering timeout, proceeding with PDF generation:', error);
          // Continue with PDF generation even if Mermaid times out
        }
      }

      // Configure PDF options with high quality settings
      const pdfOptions = {
        path: outputPath,
        format: options.format || 'A4',
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in',
          ...options.margin
        },
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || '',
        footerTemplate: options.footerTemplate || '',
        printBackground: options.printBackground !== false,
        landscape: options.landscape || false,
        scale: options.scale || 1,
        preferCSSPageSize: true,
        // High quality settings for better zoom capability
        quality: 100,
        omitBackground: false,
        tagged: true
      };

      // Generate PDF
      await page.pdf(pdfOptions);
      await page.close();

      // Get file stats
      const stats = fs.statSync(outputPath);
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        outputPath,
        metadata: {
          inputFile: resolvedMarkdownPath,
          outputFile: outputPath,
          fileSize: stats.size,
          processingTime,
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          inputFile: markdownPath,
          outputFile: outputPath || 'unknown',
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  async exportMarkdownContentToPDF(
    markdownContent: string,
    outputPath: string,
    options: PDFExportOptions = {}
  ): Promise<MarkdownToPDFResult> {
    const startTime = Date.now();
    
    try {
      // Resolve output path properly
      const resolvedOutputPath = path.resolve(outputPath);
      // Configure marked with syntax highlighting
      marked.use({
        breaks: true,
        gfm: true,
        renderer: {
          code(code: string, lang?: string) {
            // Handle Mermaid diagrams
            if (lang === 'mermaid') {
              const diagramId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
              return `<div class="mermaid-container">
                        <div id="${diagramId}" class="mermaid">${code}</div>
                      </div>`;
            }
            
            // Handle regular code with syntax highlighting
            if (lang && hljs.getLanguage(lang)) {
              try {
                const highlighted = hljs.highlight(code, { language: lang }).value;
                return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
              } catch (err) {
                console.warn('Syntax highlighting failed:', err);
              }
            }
            const highlighted = hljs.highlightAuto(code).value;
            return `<pre><code class="hljs">${highlighted}</code></pre>`;
          }
        }
      });

      // Convert markdown to HTML
      const htmlContent = marked(markdownContent);

      // Create complete HTML document with styling
      const fullHtml = this.createStyledHTML(htmlContent);

      // Initialize browser
      await this.initializeBrowser();
      const page = await this.browser.newPage();
      
      // Set high DPI for better quality
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2
      });

      // Set content and wait for it to load
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      // Wait for Mermaid diagrams to render if they exist
      const hasMermaid = fullHtml.includes('class="mermaid"');
      if (hasMermaid) {
        try {
          // Wait for mermaid-ready class to be added (indicates diagrams are rendered)
          await page.waitForSelector('body.mermaid-ready', { timeout: 10000 });
        } catch (error) {
          console.warn('Mermaid rendering timeout, proceeding with PDF generation:', error);
          // Continue with PDF generation even if Mermaid times out
        }
      }

      // Configure PDF options with high quality settings
      const pdfOptions = {
        path: resolvedOutputPath,
        format: options.format || 'A4',
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in',
          ...options.margin
        },
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || '',
        footerTemplate: options.footerTemplate || '',
        printBackground: options.printBackground !== false,
        landscape: options.landscape || false,
        scale: options.scale || 1,
        preferCSSPageSize: true,
        // High quality settings for better zoom capability
        quality: 100,
        omitBackground: false,
        tagged: true
      };

      // Generate PDF
      await page.pdf(pdfOptions);
      await page.close();

      // Get file stats
      const stats = fs.statSync(resolvedOutputPath);
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        outputPath: resolvedOutputPath,
        metadata: {
          inputFile: 'content',
          outputFile: resolvedOutputPath,
          fileSize: stats.size,
          processingTime,
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          inputFile: 'content',
          outputFile: outputPath,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  private createStyledHTML(htmlContent: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Export</title>
    <style>
        /* Reset and base styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 100%;
            margin: 0;
            padding: 0;
            background: white;
        }
        
        /* Typography */
        h1, h2, h3, h4, h5, h6 {
            margin: 1.5em 0 0.5em 0;
            font-weight: 600;
            line-height: 1.3;
            color: #2c3e50;
        }
        
        h1 { font-size: 2.5em; border-bottom: 3px solid #3498db; padding-bottom: 0.3em; }
        h2 { font-size: 2em; border-bottom: 2px solid #ecf0f1; padding-bottom: 0.3em; }
        h3 { font-size: 1.5em; }
        h4 { font-size: 1.25em; }
        h5 { font-size: 1.1em; }
        h6 { font-size: 1em; }
        
        p {
            margin: 1em 0;
            text-align: justify;
        }
        
        /* Lists */
        ul, ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        
        li {
            margin: 0.5em 0;
        }
        
        /* Code */
        code {
            background: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
            color: #e74c3c;
        }
        
        pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
            margin: 1em 0;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
            line-height: 1.4;
        }
        
        pre code {
            background: none;
            padding: 0;
            color: inherit;
        }
        
        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
            font-size: 0.9em;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 0.75em;
            text-align: left;
        }
        
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #2c3e50;
        }
        
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        /* Blockquotes */
        blockquote {
            border-left: 4px solid #3498db;
            margin: 1em 0;
            padding: 0.5em 0 0.5em 1em;
            background: #f8f9fa;
            font-style: italic;
            color: #555;
        }
        
        /* Links */
        a {
            color: #3498db;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        /* Images */
        img {
            max-width: 100%;
            height: auto;
            margin: 1em 0;
            border-radius: 5px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        /* Horizontal rules */
        hr {
            border: none;
            height: 2px;
            background: #ecf0f1;
            margin: 2em 0;
        }
        
        /* Syntax highlighting styles */
        .hljs {
            background: #2c3e50 !important;
            color: #ecf0f1 !important;
        }
        
        .hljs-keyword { color: #3498db; }
        .hljs-string { color: #2ecc71; }
        .hljs-comment { color: #95a5a6; font-style: italic; }
        .hljs-number { color: #e67e22; }
        .hljs-function { color: #9b59b6; }
        .hljs-variable { color: #e74c3c; }
        
        /* Print styles */
        @media print {
            body {
                font-size: 12pt;
                line-height: 1.5;
            }
            
            h1 { font-size: 18pt; }
            h2 { font-size: 16pt; }
            h3 { font-size: 14pt; }
            h4 { font-size: 13pt; }
            h5 { font-size: 12pt; }
            h6 { font-size: 11pt; }
            
            pre, code {
                font-size: 10pt;
            }
            
            table {
                font-size: 10pt;
            }
            
            /* Page break handling */
            h1, h2, h3, h4, h5, h6 {
                page-break-after: avoid;
            }
            
            pre, blockquote, table {
                page-break-inside: avoid;
            }
            
            img {
                page-break-inside: avoid;
                max-height: 500px;
            }
        }
        
        /* Mermaid diagram styles */
        .mermaid-container {
            margin: 2em 0;
            page-break-inside: avoid;
            width: 100%;
        }
        
        .mermaid {
            background: white;
            border: 1px solid #e1e8ed;
            border-radius: 8px;
            padding: 1em;
            width: 100%;
            min-height: 400px;
            display: block;
        }
        
        /* Mermaid specific styling */
        .mermaid svg {
            width: 100% !important;
            height: auto !important;
            max-width: none !important;
            min-height: 350px;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            themeVariables: {
                primaryColor: '#3498db',
                primaryTextColor: '#2c3e50',
                primaryBorderColor: '#2980b9',
                lineColor: '#34495e',
                secondaryColor: '#ecf0f1',
                tertiaryColor: '#f8f9fa'
            },
            flowchart: {
                useMaxWidth: false,
                htmlLabels: true,
                curve: 'basis'
            },
            sequence: {
                useMaxWidth: false
            },
            gantt: {
                useMaxWidth: false
            },
            er: {
                useMaxWidth: false
            },
            journey: {
                useMaxWidth: false
            }
        });
        
        // Wait for mermaid to render before PDF generation
        document.addEventListener('DOMContentLoaded', function() {
            mermaid.run().then(() => {
                // Add a small delay to ensure all diagrams are rendered
                setTimeout(() => {
                    document.body.classList.add('mermaid-ready');
                }, 500);
            });
        });
    </script>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

class RobustPDFExtractor {
  private tesseractWorker: any = null;

  async initializeTesseract() {
    if (!this.tesseractWorker) {
      this.tesseractWorker = await createWorker('eng');
    }
  }

  async analyzePDF(filePath: string): Promise<PDFAnalysis> {
    try {
      // First, try pdf-parse to see what we can extract
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      const textLength = pdfData.text.trim().length;
      const pageCount = pdfData.numpages;
      const avgTextPerPage = textLength / pageCount;
      
      // Analyze text quality and distribution
      const hasSubstantialText = textLength > 100;
      const hasGoodTextDensity = avgTextPerPage > 50;
      const textQualityScore = Math.min(textLength / 1000, 1); // 0-1 scale
      
      // Check for common indicators of image-based PDFs
      const hasMinimalText = textLength < 50;
      const hasVeryLowDensity = avgTextPerPage < 20;
      const textContainsGarbage = /[^\w\s\.\,\!\?\-\(\)\[\]]{3,}/.test(pdfData.text);
      
      let analysis: PDFAnalysis;
      
      if (hasSubstantialText && hasGoodTextDensity && !textContainsGarbage) {
        // High-quality text-based PDF
        analysis = {
          isTextBased: true,
          isImageBased: false,
          isHybrid: false,
          textQuality: textQualityScore > 0.8 ? 'high' : textQualityScore > 0.4 ? 'medium' : 'low',
          recommendedMethod: 'pdf-parse',
          confidence: 0.9,
          analysis: `Text-based PDF with ${textLength} characters across ${pageCount} pages. Good text extraction possible.`
        };
      } else if (hasMinimalText || hasVeryLowDensity || textContainsGarbage) {
        // Likely image-based or scanned PDF
        analysis = {
          isTextBased: false,
          isImageBased: true,
          isHybrid: false,
          textQuality: 'none',
          recommendedMethod: 'simple-ocr',
          confidence: 0.85,
          analysis: `Image-based PDF detected. Only ${textLength} characters extracted, likely scanned document. OCR required.`
        };
      } else {
        // Hybrid document with some text but may need OCR for images
        analysis = {
          isTextBased: true,
          isImageBased: true,
          isHybrid: true,
          textQuality: 'medium',
          recommendedMethod: 'pdf-parse',
          confidence: 0.7,
          analysis: `Hybrid PDF with ${textLength} characters. May contain both text and images requiring OCR.`
        };
      }
      
      return analysis;
    } catch (error) {
      // If pdf-parse fails completely, it's likely an image-based PDF
      return {
        isTextBased: false,
        isImageBased: true,
        isHybrid: false,
        textQuality: 'none',
        recommendedMethod: 'simple-ocr',
        confidence: 0.95,
        analysis: `PDF analysis failed with pdf-parse, indicating image-based document requiring OCR.`
      };
    }
  }

  async extractWithPdfParse(filePath: string): Promise<PDFExtractionResult> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      
      return {
        text: data.text,
        method: 'pdf-parse',
        success: true,
        metadata: {
          pages: data.numpages,
          title: data.info?.Title,
          author: data.info?.Author,
          creator: data.info?.Creator,
          producer: data.info?.Producer,
          creationDate: data.info?.CreationDate,
          modificationDate: data.info?.ModDate,
        }
      };
    } catch (error) {
      return {
        text: '',
        method: 'pdf-parse',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async extractWithOCR(filePath: string): Promise<PDFExtractionResult> {
    try {
      await this.initializeTesseract();
      
      // High-quality conversion for image-based PDFs
      const options = {
        density: 300,           // High DPI for better OCR accuracy
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 3000,           // Increased resolution
        height: 3000,
        quality: 100           // Maximum quality
      };
      
      const convertPdf = pdf2pic.convert(filePath, options);
      const results = await convertPdf.bulk(-1, { responseType: "buffer" });
      
      let fullText = '';
      let processedPages = 0;
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.buffer) {
          try {
            // Enhanced OCR with better settings
            const { data: { text } } = await this.tesseractWorker.recognize(result.buffer, {
              tessedit_pageseg_mode: '1',  // Automatic page segmentation with OSD
              tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine only
              preserve_interword_spaces: '1'
            });
            
            if (text.trim()) {
              fullText += `\n--- Page ${i + 1} ---\n${text}\n`;
              processedPages++;
            }
          } catch (pageError) {
            console.warn(`Failed to OCR page ${i + 1}:`, pageError);
            fullText += `\n--- Page ${i + 1} (OCR Failed) ---\n`;
          }
        }
      }
      
      return {
        text: fullText,
        method: 'Enhanced OCR (All Pages)',
        success: processedPages > 0,
        metadata: {
          pages: results.length,
          processedPages: processedPages
        }
      };
    } catch (error) {
      return {
        text: '',
        method: 'Enhanced OCR (All Pages)',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async extractWithSimpleOCR(filePath: string): Promise<PDFExtractionResult> {
    try {
      await this.initializeTesseract();
      
      // Optimized settings for image-based PDFs - process first few pages
      const options = {
        density: 200,           // Good balance of quality and speed
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2000,           // Higher resolution for better OCR
        height: 2000,
        quality: 90
      };
      
      const convertPdf = pdf2pic.convert(filePath, options);
      
      // Try to process first 3 pages for better coverage
      let fullText = '';
      let processedPages = 0;
      const maxPages = 3;
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
          const result = await convertPdf(pageNum, { responseType: "buffer" });
          
          if (result.buffer) {
            const { data: { text } } = await this.tesseractWorker.recognize(result.buffer, {
              tessedit_pageseg_mode: '3',  // Fully automatic page segmentation
              tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine
              preserve_interword_spaces: '1'
            });
            
            if (text.trim()) {
              fullText += `\n--- Page ${pageNum} ---\n${text}\n`;
              processedPages++;
            }
          }
        } catch (pageError) {
          // If we can't process this page, continue to next
          console.warn(`Failed to process page ${pageNum}:`, pageError);
          break; // Stop if we hit an error (likely no more pages)
        }
      }
      
      return {
        text: fullText || 'No text could be extracted from the first few pages',
        method: 'Smart OCR (First 3 Pages)',
        success: processedPages > 0,
        metadata: {
          pages: maxPages,
          processedPages: processedPages
        }
      };
    } catch (error) {
      return {
        text: '',
        method: 'Smart OCR (First 3 Pages)',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async smartExtractText(filePath: string): Promise<PDFExtractionResult> {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Validate file is PDF
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') {
      throw new Error(`File is not a PDF: ${filePath}`);
    }
    
    // Step 1: Analyze the PDF to determine optimal extraction method
    const analysis = await this.analyzePDF(filePath);
    console.log(`PDF Analysis: ${analysis.analysis}`);
    console.log(`Recommended method: ${analysis.recommendedMethod} (confidence: ${analysis.confidence})`);
    
    // Step 2: Use the recommended method
    let result: PDFExtractionResult;
    
    switch (analysis.recommendedMethod) {
      case 'pdf-parse':
        result = await this.extractWithPdfParse(filePath);
        
        // If pdf-parse fails or gives poor results on a supposedly text-based PDF, fallback to OCR
        if (!result.success || (result.text.trim().length < 50 && analysis.isTextBased)) {
          console.log('PDF-parse failed on text-based PDF, falling back to OCR...');
          result = await this.extractWithSimpleOCR(filePath);
        }
        break;
        
      case 'simple-ocr':
        result = await this.extractWithSimpleOCR(filePath);
        
        // If simple OCR fails, try full OCR
        if (!result.success || result.text.trim().length < 20) {
          console.log('Simple OCR failed, trying full OCR...');
          result = await this.extractWithOCR(filePath);
        }
        break;
        
      case 'ocr':
        result = await this.extractWithOCR(filePath);
        break;
        
      default:
        // Fallback to pdf-parse
        result = await this.extractWithPdfParse(filePath);
    }
    
    // Step 3: If the recommended method failed, try intelligent fallback
    if (!result.success || result.text.trim().length < 10) {
      console.log('Primary method failed, trying intelligent fallback...');
      
      if (analysis.recommendedMethod === 'pdf-parse') {
        // Text-based PDF failed, try OCR
        result = await this.extractWithSimpleOCR(filePath);
        if (!result.success || result.text.trim().length < 20) {
          result = await this.extractWithOCR(filePath);
        }
      } else {
        // OCR failed, try pdf-parse as last resort
        const fallbackResult = await this.extractWithPdfParse(filePath);
        if (fallbackResult.success && fallbackResult.text.trim().length > result.text.trim().length) {
          result = fallbackResult;
        }
      }
    }
    
    // Add analysis information to the result
    result.metadata = {
      pages: result.metadata?.pages || 0,
      ...result.metadata,
      analysis: analysis.analysis,
      recommendedMethod: analysis.recommendedMethod,
      confidence: analysis.confidence,
      pdfType: analysis.isImageBased ? 'image-based' : analysis.isHybrid ? 'hybrid' : 'text-based'
    };
    
    return result;
  }

  async extractText(filePath: string, methods: string[] = ['pdf-parse', 'simple-ocr'], tryAllMethods: boolean = false): Promise<PDFExtractionResult[]> {
    const results: PDFExtractionResult[] = [];
    
    // If no specific methods requested, use smart extraction
    if (methods.length === 0 || (methods.length === 2 && methods.includes('pdf-parse') && methods.includes('simple-ocr'))) {
      const smartResult = await this.smartExtractText(filePath);
      return [smartResult];
    }
    
    // Otherwise, use the original method-specific extraction
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Validate file is PDF
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') {
      throw new Error(`File is not a PDF: ${filePath}`);
    }
    
    // Try each method
    for (const method of methods) {
      let result: PDFExtractionResult;
      
      switch (method) {
        case 'pdf-parse':
          result = await this.extractWithPdfParse(filePath);
          break;
        case 'ocr':
          result = await this.extractWithOCR(filePath);
          break;
        case 'simple-ocr':
          result = await this.extractWithSimpleOCR(filePath);
          break;
        default:
          continue;
      }
      
      results.push(result);
      
      // If we got successful text extraction, we can stop here unless all methods are requested
      if (!tryAllMethods && result.success && result.text.trim().length > 0) {
        break;
      }
    }
    
    return results;
  }

  async cleanup() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

const server = new Server(
  {
    name: 'pdf-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const pdfExtractor = new RobustPDFExtractor();
const markdownExporter = new MarkdownToPDFExporter();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'extract_pdf_text_smart',
        description: 'Intelligently extract text from ANY PDF format - automatically detects optimal method for text-based, image-based, or scanned PDFs',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the PDF file to extract text from',
            }
          },
          required: ['file_path'],
        },
      },
      {
        name: 'extract_pdf_text',
        description: 'Extract text from PDF files using specific methods (for advanced users)',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the PDF file to extract text from',
            },
            methods: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['pdf-parse', 'ocr', 'simple-ocr']
              },
              description: 'Extraction methods to try (default: smart detection)',
              default: ['pdf-parse', 'simple-ocr']
            },
            try_all_methods: {
              type: 'boolean',
              description: 'Whether to try all methods even if one succeeds (default: false)',
              default: false
            }
          },
          required: ['file_path'],
        },
      },
      {
        name: 'get_pdf_metadata',
        description: 'Extract metadata from PDF files',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the PDF file to extract metadata from',
            }
          },
          required: ['file_path'],
        },
      },
      {
        name: 'export_markdown_to_pdf',
        description: 'Export a Markdown file to PDF with professional styling and syntax highlighting',
        inputSchema: {
          type: 'object',
          properties: {
            markdown_path: {
              type: 'string',
              description: 'Path to the Markdown file to convert to PDF. Use relative paths (e.g., "./file.md") or absolute paths. Relative paths are resolved from the current working directory.',
            },
            output_path: {
              type: 'string',
              description: 'Optional output path for the PDF file (defaults to same directory as markdown file). Use relative paths (e.g., "./output.pdf") or absolute paths. Relative paths are resolved from the current working directory.',
            },
            format: {
              type: 'string',
              enum: ['A4', 'Letter', 'Legal'],
              description: 'Page format for the PDF (default: A4)',
              default: 'A4'
            },
            landscape: {
              type: 'boolean',
              description: 'Whether to use landscape orientation (default: false)',
              default: false
            },
            margin_top: {
              type: 'string',
              description: 'Top margin (default: 1in)',
              default: '1in'
            },
            margin_bottom: {
              type: 'string',
              description: 'Bottom margin (default: 1in)',
              default: '1in'
            },
            margin_left: {
              type: 'string',
              description: 'Left margin (default: 1in)',
              default: '1in'
            },
            margin_right: {
              type: 'string',
              description: 'Right margin (default: 1in)',
              default: '1in'
            }
          },
          required: ['markdown_path'],
        },
      },
      {
        name: 'export_markdown_content_to_pdf',
        description: 'Export Markdown content (as text) directly to PDF without requiring a file',
        inputSchema: {
          type: 'object',
          properties: {
            markdown_content: {
              type: 'string',
              description: 'Markdown content as a string to convert to PDF',
            },
            output_path: {
              type: 'string',
              description: 'Output path for the PDF file. Use relative paths (e.g., "./output.pdf") or absolute paths. Relative paths are resolved from the current working directory.',
            },
            format: {
              type: 'string',
              enum: ['A4', 'Letter', 'Legal'],
              description: 'Page format for the PDF (default: A4)',
              default: 'A4'
            },
            landscape: {
              type: 'boolean',
              description: 'Whether to use landscape orientation (default: false)',
              default: false
            },
            margin_top: {
              type: 'string',
              description: 'Top margin (default: 1in)',
              default: '1in'
            },
            margin_bottom: {
              type: 'string',
              description: 'Bottom margin (default: 1in)',
              default: '1in'
            },
            margin_left: {
              type: 'string',
              description: 'Left margin (default: 1in)',
              default: '1in'
            },
            margin_right: {
              type: 'string',
              description: 'Right margin (default: 1in)',
              default: '1in'
            }
          },
          required: ['markdown_content', 'output_path'],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'extract_pdf_text_smart': {
        const { file_path } = args as {
          file_path: string;
        };

        const result = await pdfExtractor.smartExtractText(file_path);
        
        if (result.success && result.text.trim().length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Smart extraction using ${result.method}:\n\nAnalysis: ${result.metadata?.analysis}\nPDF Type: ${result.metadata?.pdfType}\nConfidence: ${result.metadata?.confidence}\n\n${result.text}`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Smart extraction failed: ${result.error || 'Unknown error'}\nMethod attempted: ${result.method}\nAnalysis: ${result.metadata?.analysis}`
              }
            ],
            isError: true
          };
        }
      }

      case 'extract_pdf_text': {
        const { file_path, methods = ['pdf-parse', 'simple-ocr'], try_all_methods = false } = args as {
          file_path: string;
          methods?: string[];
          try_all_methods?: boolean;
        };

        const results = await pdfExtractor.extractText(file_path, methods, try_all_methods);
        
        // Find the best result
        const successfulResult = results.find(r => r.success && r.text.trim().length > 0);
        const bestResult = successfulResult || results[0];
        
        if (try_all_methods) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  all_results: results,
                  best_result: bestResult,
                  summary: {
                    total_methods_tried: results.length,
                    successful_methods: results.filter(r => r.success).length,
                    text_extracted: bestResult?.success && bestResult.text.trim().length > 0,
                    best_method: bestResult?.method
                  }
                }, null, 2)
              }
            ]
          };
        } else {
          if (bestResult?.success && bestResult.text.trim().length > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Extracted using ${bestResult.method}:\n\n${bestResult.text}`
                }
              ]
            };
          } else {
            const errorSummary = results.map(r => `${r.method}: ${r.error || 'No text found'}`).join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `Failed to extract text from PDF. Errors:\n${errorSummary}`
                }
              ]
            };
          }
        }
      }

      case 'get_pdf_metadata': {
        const { file_path } = args as { file_path: string };
        
        // Try to get metadata using pdf-parse first
        const result = await pdfExtractor.extractWithPdfParse(file_path);
        
        if (result.success && result.metadata) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.metadata, null, 2)
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to extract metadata: ${result.error}`
              }
            ]
          };
        }
      }

      case 'export_markdown_to_pdf': {
        const {
          markdown_path,
          output_path,
          format = 'A4',
          landscape = false,
          margin_top = '1in',
          margin_bottom = '1in',
          margin_left = '1in',
          margin_right = '1in'
        } = args as {
          markdown_path: string;
          output_path?: string;
          format?: 'A4' | 'Letter' | 'Legal';
          landscape?: boolean;
          margin_top?: string;
          margin_bottom?: string;
          margin_left?: string;
          margin_right?: string;
        };

        const options: PDFExportOptions = {
          format,
          landscape,
          margin: {
            top: margin_top,
            bottom: margin_bottom,
            left: margin_left,
            right: margin_right
          },
          printBackground: true
        };

        const result = await markdownExporter.exportMarkdownToPDF(markdown_path, output_path, options);
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Successfully exported Markdown to PDF!\n\nInput: ${result.metadata?.inputFile}\nOutput: ${result.metadata?.outputFile}\nFile size: ${result.metadata?.fileSize} bytes\nProcessing time: ${result.metadata?.processingTime}ms`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to export Markdown to PDF: ${result.error}`
              }
            ],
            isError: true
          };
        }
      }

      case 'export_markdown_content_to_pdf': {
        const {
          markdown_content,
          output_path,
          format = 'A4',
          landscape = false,
          margin_top = '1in',
          margin_bottom = '1in',
          margin_left = '1in',
          margin_right = '1in'
        } = args as {
          markdown_content: string;
          output_path: string;
          format?: 'A4' | 'Letter' | 'Legal';
          landscape?: boolean;
          margin_top?: string;
          margin_bottom?: string;
          margin_left?: string;
          margin_right?: string;
        };

        const options: PDFExportOptions = {
          format,
          landscape,
          margin: {
            top: margin_top,
            bottom: margin_bottom,
            left: margin_left,
            right: margin_right
          },
          printBackground: true
        };

        const result = await markdownExporter.exportMarkdownContentToPDF(markdown_content, output_path, options);
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Successfully exported Markdown content to PDF!\n\nOutput: ${result.metadata?.outputFile}\nFile size: ${result.metadata?.fileSize} bytes\nProcessing time: ${result.metadata?.processingTime}ms`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to export Markdown content to PDF: ${result.error}`
              }
            ],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Cleanup on exit
  process.on('SIGINT', async () => {
    await pdfExtractor.cleanup();
    await markdownExporter.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await pdfExtractor.cleanup();
    await markdownExporter.cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
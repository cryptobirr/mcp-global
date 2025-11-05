"""
Web Crawler for Knowledge Base MCP Server
Crawls websites and saves content as markdown for GraphRAG indexing.
Version: 1.0
Created: 2025-10-18
"""

import asyncio
import os
from pathlib import Path
from typing import List, Dict, Tuple
from urllib.parse import urljoin, urlparse
import requests
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode


def detect_strategy(url: str) -> Tuple[str, str]:
    """
    Detect the best crawling strategy for a URL.

    Args:
        url: Base URL to analyze

    Returns:
        Tuple of (strategy, discovered_url)
        - strategy: 'sitemap' or 'recursive'
        - discovered_url: URL to use for crawling
    """
    # Normalize URL
    if not url.startswith(('http://', 'https://')):
        url = f'https://{url}'
    url = url.rstrip('/')

    # Check for sitemap
    sitemap_found, sitemap_url = check_sitemap(url)
    if sitemap_found:
        return ('sitemap', sitemap_url)

    # Fall back to recursive
    return ('recursive', url)


def check_sitemap(base_url: str, timeout: int = 10) -> Tuple[bool, str]:
    """
    Check if a sitemap exists at common locations.

    Args:
        base_url: Base URL to check
        timeout: Request timeout in seconds

    Returns:
        Tuple of (found, sitemap_url)
    """
    common_paths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap/sitemap.xml',
    ]

    for path in common_paths:
        sitemap_url = urljoin(base_url, path)
        try:
            response = requests.head(
                sitemap_url,
                timeout=timeout,
                allow_redirects=True,
                headers={'User-Agent': 'Mozilla/5.0 (Knowledge Base Crawler)'}
            )
            if response.status_code == 200:
                return (True, sitemap_url)
        except requests.RequestException:
            continue

    # Check robots.txt
    robots_url = urljoin(base_url, '/robots.txt')
    try:
        response = requests.get(
            robots_url,
            timeout=timeout,
            headers={'User-Agent': 'Mozilla/5.0 (Knowledge Base Crawler)'}
        )
        if response.status_code == 200:
            for line in response.text.split('\n'):
                if line.lower().startswith('sitemap:'):
                    sitemap_url = line.split(':', 1)[1].strip()
                    try:
                        verify_response = requests.head(sitemap_url, timeout=timeout)
                        if verify_response.status_code == 200:
                            return (True, sitemap_url)
                    except requests.RequestException:
                        pass
    except requests.RequestException:
        pass

    return (False, "")


async def crawl_website(url: str, max_pages: int = 100) -> List[Dict[str, str]]:
    """
    Crawl a website and extract content as markdown.

    Args:
        url: URL to crawl
        max_pages: Maximum number of pages to crawl

    Returns:
        List of dicts with 'url', 'title', and 'markdown' keys
    """
    strategy, discovered_url = detect_strategy(url)
    print(f"📊 Strategy: {strategy}")
    print(f"🎯 URL: {discovered_url}")

    if strategy == 'sitemap':
        return await crawl_from_sitemap(discovered_url, max_pages)
    else:
        return await crawl_recursive(discovered_url, max_pages)


async def crawl_from_sitemap(sitemap_url: str, max_pages: int) -> List[Dict[str, str]]:
    """
    Crawl pages listed in a sitemap.

    Args:
        sitemap_url: URL of the sitemap
        max_pages: Maximum number of pages to crawl

    Returns:
        List of crawled pages
    """
    # Extract URLs from sitemap
    urls = extract_sitemap_urls(sitemap_url)
    urls = urls[:max_pages]  # Limit pages

    print(f"📄 Found {len(urls)} pages in sitemap")

    # Crawl all URLs
    pages = await crawl_urls(urls)
    return pages


def extract_sitemap_urls(sitemap_url: str) -> List[str]:
    """
    Extract URLs from a sitemap XML file.

    Args:
        sitemap_url: URL of the sitemap

    Returns:
        List of URLs found in sitemap
    """
    try:
        response = requests.get(sitemap_url, timeout=30)
        response.raise_for_status()

        # Simple XML parsing (handles both <loc> tags and sitemap indices)
        import re
        urls = re.findall(r'<loc>(.*?)</loc>', response.text)

        # If this is a sitemap index, recursively fetch sub-sitemaps
        all_urls = []
        for url in urls:
            if 'sitemap' in url.lower() and url.endswith('.xml'):
                # This is a sub-sitemap
                all_urls.extend(extract_sitemap_urls(url))
            else:
                # This is a page URL
                all_urls.append(url)

        return all_urls
    except Exception as e:
        print(f"⚠️  Error extracting sitemap URLs: {e}")
        return []


async def crawl_recursive(start_url: str, max_pages: int, max_depth: int = 3) -> List[Dict[str, str]]:
    """
    Recursively crawl a website starting from a URL.

    Args:
        start_url: Starting URL
        max_pages: Maximum number of pages to crawl
        max_depth: Maximum crawl depth

    Returns:
        List of crawled pages
    """
    base_domain = get_base_domain(start_url)
    visited = set()
    to_visit = [(start_url, 0)]  # (url, depth)
    pages = []

    async with AsyncWebCrawler(verbose=True) as crawler:
        while to_visit and len(pages) < max_pages:
            url, depth = to_visit.pop(0)

            if url in visited or depth > max_depth:
                continue

            visited.add(url)

            try:
                # Crawl the page
                config = CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    exclude_external_links=True,
                    exclude_social_media_links=True,
                )
                result = await crawler.arun(url=url, config=config)

                if result.success and result.markdown:
                    pages.append({
                        'url': url,
                        'title': result.metadata.get('title', 'Untitled'),
                        'markdown': result.markdown
                    })
                    print(f"✅ Crawled ({len(pages)}/{max_pages}): {url}")

                    # Extract internal links for next level
                    if depth < max_depth:
                        for link in result.links.get('internal', []):
                            link_url = link.get('href')
                            if link_url and link_url.startswith(base_domain):
                                to_visit.append((link_url, depth + 1))
                else:
                    print(f"⚠️  Failed: {url}")

            except Exception as e:
                print(f"❌ Error crawling {url}: {e}")

    return pages


async def crawl_urls(urls: List[str]) -> List[Dict[str, str]]:
    """
    Crawl a list of URLs in parallel.

    Args:
        urls: List of URLs to crawl

    Returns:
        List of crawled pages
    """
    pages = []

    async with AsyncWebCrawler(verbose=False) as crawler:
        # Crawl in batches to avoid overwhelming the server
        batch_size = 10
        for i in range(0, len(urls), batch_size):
            batch = urls[i:i+batch_size]

            tasks = []
            for url in batch:
                config = CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    exclude_external_links=True,
                )
                tasks.append(crawler.arun(url=url, config=config))

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for url, result in zip(batch, results):
                if isinstance(result, Exception):
                    print(f"❌ Error: {url} - {result}")
                    continue

                if result.success and result.markdown:
                    pages.append({
                        'url': url,
                        'title': result.metadata.get('title', 'Untitled'),
                        'markdown': result.markdown
                    })
                    print(f"✅ Crawled ({len(pages)}/{len(urls)}): {url}")

    return pages


def save_to_input_dir(kb_path: str, pages: List[Dict[str, str]]) -> None:
    """
    Save crawled pages to GraphRAG input directory.

    Args:
        kb_path: Path to knowledge base directory
        pages: List of crawled pages
    """
    input_dir = Path(kb_path) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    for i, page in enumerate(pages):
        # Create a safe filename from URL
        filename = f"{i:04d}_{safe_filename(page['title'])}.txt"
        filepath = input_dir / filename

        # Write content with metadata header
        content = f"# {page['title']}\n\n"
        content += f"Source: {page['url']}\n\n"
        content += f"---\n\n"
        content += page['markdown']

        filepath.write_text(content, encoding='utf-8')

    print(f"💾 Saved {len(pages)} pages to {input_dir}")


def safe_filename(name: str, max_length: int = 50) -> str:
    """
    Convert a string to a safe filename.

    Args:
        name: String to convert
        max_length: Maximum filename length

    Returns:
        Safe filename string
    """
    # Remove invalid characters
    safe = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_'))
    # Replace spaces with underscores
    safe = safe.replace(' ', '_')
    # Limit length
    safe = safe[:max_length]
    # Remove trailing underscores
    safe = safe.strip('_')
    return safe or 'untitled'


def get_base_domain(url: str) -> str:
    """
    Extract the base domain from a URL.

    Args:
        url: Full URL

    Returns:
        Base domain (scheme + netloc)
    """
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


class WebsiteCrawler:
    """
    Website crawler for knowledge base creation.

    Provides a class-based interface for website crawling operations
    that integrates with the knowledge base creation pipeline.
    """

    def __init__(self, max_pages: int = 100, max_depth: int = 3):
        """
        Initialize the website crawler.

        Args:
            max_pages: Maximum number of pages to crawl
            max_depth: Maximum crawl depth for recursive crawling
        """
        self.max_pages = max_pages
        self.max_depth = max_depth

    async def crawl_website(self, url: str) -> List[Dict[str, str]]:
        """
        Crawl a website and extract content as markdown.

        Args:
            url: URL to crawl

        Returns:
            List of dicts with 'url', 'title', and 'content' keys
        """
        pages = await crawl_website(url, max_pages=self.max_pages)

        # Convert to expected format
        converted_pages = []
        for page in pages:
            converted_pages.append({
                'url': page['url'],
                'title': page['title'],
                'content': page['markdown']
            })

        return converted_pages

    def save_to_input_dir(self, kb_path: str, pages: List[Dict[str, str]]) -> None:
        """
        Save crawled pages to GraphRAG input directory.

        Args:
            kb_path: Path to knowledge base directory
            pages: List of crawled pages
        """
        # Convert back to expected format for the save function
        converted_pages = []
        for page in pages:
            converted_pages.append({
                'url': page['url'],
                'title': page['title'],
                'markdown': page['content']
            })

        save_to_input_dir(kb_path, converted_pages)


if __name__ == "__main__":
    # Test the crawler
    import sys

    if len(sys.argv) < 2:
        print("Usage: python crawler.py <url> [max_pages]")
        sys.exit(1)

    test_url = sys.argv[1]
    test_max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    print(f"🚀 Testing crawler with: {test_url}")
    pages = asyncio.run(crawl_website(test_url, max_pages=test_max_pages))
    print(f"\n✅ Crawled {len(pages)} pages")

    for i, page in enumerate(pages[:5]):
        print(f"{i+1}. {page['title']} - {page['url']}")

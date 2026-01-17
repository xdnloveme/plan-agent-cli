import { z } from 'zod';
import { BaseTool, type ToolContext, type ToolResult } from '../BaseTool';

/**
 * Web search input schema
 */
const webSearchInputSchema = z.object({
  query: z.string().min(1).describe('Search query string'),
  maxResults: z.number().min(1).max(10).default(5).describe('Maximum number of results to return'),
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;

/**
 * Search result item
 */
interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search result
 */
interface WebSearchResult {
  query: string;
  results: SearchResultItem[];
  totalResults: number;
}

/**
 * Search provider interface for dependency injection
 */
export interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchResultItem[]>;
}

/**
 * Mock search provider for testing
 */
export class MockSearchProvider implements SearchProvider {
  async search(query: string, maxResults: number): Promise<SearchResultItem[]> {
    // Return mock results for testing
    const mockResults: SearchResultItem[] = [
      {
        title: `Result 1 for: ${query}`,
        url: `https://example.com/result1?q=${encodeURIComponent(query)}`,
        snippet: `This is a mock search result snippet for the query "${query}".`,
      },
      {
        title: `Result 2 for: ${query}`,
        url: `https://example.com/result2?q=${encodeURIComponent(query)}`,
        snippet: `Another mock result providing information about "${query}".`,
      },
      {
        title: `Result 3 for: ${query}`,
        url: `https://example.com/result3?q=${encodeURIComponent(query)}`,
        snippet: `Third mock result with relevant content for "${query}".`,
      },
    ];

    return mockResults.slice(0, maxResults);
  }
}

/**
 * Web search tool for searching the internet
 *
 * This tool requires a search provider to be injected.
 * By default, it uses a mock provider for testing.
 * In production, implement a real SearchProvider (e.g., using SerpAPI, Brave Search, etc.)
 */
export class WebSearchTool extends BaseTool<typeof webSearchInputSchema, WebSearchResult> {
  readonly name = 'web_search';
  readonly description =
    'Search the web for information. Returns a list of relevant web pages with titles, URLs, and snippets.';
  readonly inputSchema = webSearchInputSchema;

  private provider: SearchProvider;

  constructor(provider?: SearchProvider) {
    super();
    this.provider = provider ?? new MockSearchProvider();
  }

  async execute(
    input: WebSearchInput,
    _context?: ToolContext
  ): Promise<ToolResult<WebSearchResult>> {
    try {
      const results = await this.provider.search(input.query, input.maxResults);

      return {
        success: true,
        data: {
          query: input.query,
          results,
          totalResults: results.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  }

  /**
   * Set a different search provider
   */
  setProvider(provider: SearchProvider): void {
    this.provider = provider;
  }
}

/**
 * Create a web search tool instance
 */
export function createWebSearchTool(provider?: SearchProvider): WebSearchTool {
  return new WebSearchTool(provider);
}

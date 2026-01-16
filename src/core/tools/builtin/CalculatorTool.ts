import { z } from 'zod';
import { BaseTool, type ToolContext, type ToolResult } from '../BaseTool';

/**
 * Calculator input schema
 */
const calculatorInputSchema = z.object({
  expression: z
    .string()
    .describe('Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(3.14)")'),
});

type CalculatorInput = z.infer<typeof calculatorInputSchema>;

/**
 * Calculator result
 */
interface CalculatorResult {
  expression: string;
  result: number;
}

/**
 * Safe mathematical functions
 */
const mathFunctions: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  pow: Math.pow,
  exp: Math.exp,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  min: Math.min,
  max: Math.max,
  random: Math.random,
};

/**
 * Mathematical constants
 */
const mathConstants: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  LN2: Math.LN2,
  LN10: Math.LN10,
  LOG2E: Math.LOG2E,
  LOG10E: Math.LOG10E,
  SQRT2: Math.SQRT2,
  SQRT1_2: Math.SQRT1_2,
};

/**
 * Calculator tool for evaluating mathematical expressions
 */
export class CalculatorTool extends BaseTool<typeof calculatorInputSchema, CalculatorResult> {
  readonly name = 'calculator';
  readonly description =
    'Evaluate mathematical expressions. Supports basic arithmetic (+, -, *, /, %), ' +
    'exponentiation (**), parentheses, and common math functions (sqrt, sin, cos, etc.) ' +
    'and constants (PI, E).';
  readonly inputSchema = calculatorInputSchema;

  async execute(
    input: CalculatorInput,
    _context?: ToolContext
  ): Promise<ToolResult<CalculatorResult>> {
    try {
      const result = this.evaluateExpression(input.expression);
      return {
        success: true,
        data: {
          expression: input.expression,
          result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to evaluate expression',
      };
    }
  }

  /**
   * Safely evaluate a mathematical expression
   */
  private evaluateExpression(expression: string): number {
    // Sanitize and prepare expression
    let sanitized = expression
      .replace(/\s+/g, '') // Remove whitespace
      .replace(/\^/g, '**'); // Convert ^ to **

    // Replace function calls with safe versions
    for (const name of Object.keys(mathFunctions)) {
      const regex = new RegExp(`\\b${name}\\s*\\(`, 'gi');
      sanitized = sanitized.replace(regex, `__fn_${name}(`);
    }

    // Replace constants
    for (const [name, value] of Object.entries(mathConstants)) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      sanitized = sanitized.replace(regex, String(value));
    }

    // Validate that only safe characters remain
    const safePattern = /^[0-9+\-*/%().e,_a-z\s]+$/i;
    if (!safePattern.test(sanitized)) {
      throw new Error('Expression contains invalid characters');
    }

    // Create evaluation function with math functions in scope
    const fnScope = Object.fromEntries(
      Object.entries(mathFunctions).map(([name, fn]) => [`__fn_${name}`, fn])
    );

    // Build function body
    const fnBody = `
      const { ${Object.keys(fnScope).join(', ')} } = scope;
      return (${sanitized});
    `;

    // Execute safely
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const evalFn = new Function('scope', fnBody);
      const result = evalFn(fnScope);

      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('Expression did not evaluate to a finite number');
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('finite number')) {
        throw error;
      }
      throw new Error(`Invalid expression: ${expression}`);
    }
  }
}

/**
 * Create a calculator tool instance
 */
export function createCalculatorTool(): CalculatorTool {
  return new CalculatorTool();
}

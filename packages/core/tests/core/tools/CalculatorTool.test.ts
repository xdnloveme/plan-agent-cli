import { describe, it, expect } from 'vitest';
import { CalculatorTool } from '../../../src/core/tools/builtin/CalculatorTool.js';

describe('CalculatorTool', () => {
  const calculator = new CalculatorTool();

  describe('basic arithmetic', () => {
    it('should add numbers', async () => {
      const result = await calculator.execute({ expression: '2 + 3' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(5);
    });

    it('should subtract numbers', async () => {
      const result = await calculator.execute({ expression: '10 - 4' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(6);
    });

    it('should multiply numbers', async () => {
      const result = await calculator.execute({ expression: '6 * 7' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(42);
    });

    it('should divide numbers', async () => {
      const result = await calculator.execute({ expression: '15 / 3' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(5);
    });

    it('should handle modulo', async () => {
      const result = await calculator.execute({ expression: '17 % 5' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(2);
    });
  });

  describe('complex expressions', () => {
    it('should handle parentheses', async () => {
      const result = await calculator.execute({ expression: '(2 + 3) * 4' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(20);
    });

    it('should handle exponentiation', async () => {
      const result = await calculator.execute({ expression: '2 ** 8' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(256);
    });

    it('should handle ^ as exponentiation', async () => {
      const result = await calculator.execute({ expression: '2 ^ 3' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(8);
    });
  });

  describe('math functions', () => {
    it('should calculate sqrt', async () => {
      const result = await calculator.execute({ expression: 'sqrt(16)' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(4);
    });

    it('should calculate abs', async () => {
      const result = await calculator.execute({ expression: 'abs(-42)' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(42);
    });

    it('should calculate sin', async () => {
      const result = await calculator.execute({ expression: 'sin(0)' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(0);
    });

    it('should calculate cos', async () => {
      const result = await calculator.execute({ expression: 'cos(0)' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBe(1);
    });

    it('should handle floor and ceil', async () => {
      const floorResult = await calculator.execute({ expression: 'floor(3.7)' });
      expect(floorResult.data?.result).toBe(3);

      const ceilResult = await calculator.execute({ expression: 'ceil(3.2)' });
      expect(ceilResult.data?.result).toBe(4);
    });
  });

  describe('constants', () => {
    it('should recognize PI', async () => {
      const result = await calculator.execute({ expression: 'PI' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBeCloseTo(Math.PI);
    });

    it('should recognize E', async () => {
      const result = await calculator.execute({ expression: 'E' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBeCloseTo(Math.E);
    });

    it('should use PI in expressions', async () => {
      const result = await calculator.execute({ expression: '2 * PI' });
      expect(result.success).toBe(true);
      expect(result.data?.result).toBeCloseTo(2 * Math.PI);
    });
  });

  describe('error handling', () => {
    it('should reject invalid expressions', async () => {
      const result = await calculator.execute({ expression: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject dangerous expressions', async () => {
      const result = await calculator.execute({ expression: 'process.exit()' });
      expect(result.success).toBe(false);
    });
  });

  describe('CoreTool conversion', () => {
    it('should convert to CoreTool format', () => {
      const coreTool = calculator.toCoreTool();
      expect(coreTool.description).toBe(calculator.description);
      expect(coreTool.parameters).toBeDefined();
      expect(coreTool.execute).toBeInstanceOf(Function);
    });
  });
});

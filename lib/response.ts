import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export function removeEmptyFields(obj: any): any {
  // Handle null or undefined input
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj
      .map((item) => removeEmptyFields(item))
      .filter(
        (item) =>
          item !== undefined &&
          item !== null &&
          (typeof item !== "string" || item !== "") &&
          (!Array.isArray(item) || item.length > 0),
      );
  }

  // Handle objects
  if (typeof obj === "object") {
    const result: { [key: string]: any } = {};

    for (const [key, value] of Object.entries(obj)) {
      // Process the value recursively
      const processedValue = removeEmptyFields(value);

      // Only include non-empty values
      if (
        processedValue !== undefined &&
        processedValue !== null &&
        (typeof processedValue !== "string" || processedValue !== "") &&
        (!Array.isArray(processedValue) || processedValue.length > 0)
      ) {
        result[key] = processedValue;
      }
    }

    // Return undefined if object is empty after processing
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Return primitive values as-is
  return obj;
}

export function createErrorResponse(
  error: unknown,
  context?: Record<string, any>
): CallToolResult {
  console.error('Error in operation:', error);
  if (context) {
    console.error('Error context:', context);
  }

  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  return {
    content: [
      {
        type: 'text',
        text: `Error: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

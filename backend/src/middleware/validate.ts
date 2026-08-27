import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Validate request body/query/params against a Zod schema
 */
export function validate(schema: AnyZodObject, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const mainMessage = formattedErrors.map((e) => e.message).join(' | ') || 'Validation failed';
        next(ApiError.badRequest(mainMessage, formattedErrors));
      } else {
        next(error);
      }
    }
  };
}

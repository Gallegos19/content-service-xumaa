import { NextFunction, Request, Response } from 'express';
import { Schema } from 'joi';

export function validateRequest(schemas: {
  params?: Schema;
  query?: Schema;
  body?: Schema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error: paramsError } = schemas.params?.validate(req.params) || {};
    const { error: queryError } = schemas.query?.validate(req.query) || {};
    const { error: bodyError } = schemas.body?.validate(req.body) || {};

    const errors = [paramsError, queryError, bodyError].filter(Boolean);

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation error',
        details: errors.map(e => e?.message)
      });
    }

    next();
  };
}

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('API Health Endpoint', () => {
  it('GET /api/health should return 200 OK with health details', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status', 'healthy');
    expect(response.body.data).toHaveProperty('uptime');
    expect(response.body.data).toHaveProperty('timestamp');
  });

  it('GET /api/non-existent-route should return 404 Not Found', async () => {
    const response = await request(app).get('/api/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toHaveProperty('statusCode', 404);
  });
});

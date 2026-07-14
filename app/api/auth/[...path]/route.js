import { NextResponse } from 'next/server';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8080';
async function proxy(request, { params }) {
  try {
    const path = (params.path || []).join('/');
    const headers = { 'Content-Type': 'application/json' };
    const authorization = request.headers.get('authorization');
    if (authorization) headers.Authorization = authorization;
    const init = { method: request.method, headers, cache: 'no-store' };
    if (request.method !== 'GET') {
      init.body = await request.text();
    }
    const response = await fetch(`${backendUrl}/api/v1/auth/${path}`, init);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: { message: 'Auth backend unavailable' } },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;

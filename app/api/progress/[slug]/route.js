import { NextResponse } from 'next/server';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8080';

export async function PUT(request, { params }) {
  try {
    const authorization = request.headers.get('authorization');
    const response = await fetch(
      `${backendUrl}/api/v1/progress/${encodeURIComponent(params.slug)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: await request.text(),
        cache: 'no-store',
      },
    );
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: { message: 'Learning progress backend unavailable' } },
      { status: 503 },
    );
  }
}

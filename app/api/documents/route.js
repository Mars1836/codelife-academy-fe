import { NextResponse } from 'next/server';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8080';

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/api/v1/documents`, { cache: 'no-store' });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: { message: 'Backend tài liệu không khả dụng' } },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
    return NextResponse.json({ error: 'Deprecated example route' }, { status: 410 });
}

export async function GET(_req: NextRequest) {
    return NextResponse.json({ error: 'Deprecated example route' }, { status: 410 });
}

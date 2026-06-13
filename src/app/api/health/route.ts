import { NextResponse } from "next/server";

// Basit sağlık kontrolü ve dış sistemlerin entegrasyon testi için uç nokta.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "sunar-tarimsal-crm",
    time: new Date().toISOString(),
  });
}

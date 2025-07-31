// src/app/api/upload-r2/route.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// 从环境变量中获取配置
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// 增加启动时检查，确保所有环境变量都存在
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.error("Cloudflare R2 环境变量缺失! 请检查您的 .env.local 文件。");
  // 在非生产环境下，这会使服务器启动失败，从而立刻暴露问题
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('缺少 Cloudflare R2 的环境变量，请检查 .env.local 文件');
  }
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export async function POST(request: Request) {
  console.log("收到生成预签名 URL 的请求...");
  try {
    const { fileType, userId } = await request.json();
    console.log(`请求参数: fileType=${fileType}, userId=${userId}`);

    if (!fileType || !userId) {
      console.error("请求缺少 fileType 或 userId");
      return NextResponse.json({ error: '文件类型和用户ID是必需的' }, { status: 400 });
    }

    const fileExtension = fileType.split('/')[1];
    const fileName = `${userId}/${generateFileName()}.${fileExtension}`;
    console.log(`生成的文件名: ${fileName}`);

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      ContentType: fileType,
    });

    console.log("正在生成预签名 URL...");
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    console.log("预签名 URL 生成成功。");

    return NextResponse.json({ 
      uploadUrl: signedUrl, 
      accessUrl: `${R2_PUBLIC_URL}/${fileName}`
    });

  } catch (error: any) {
    console.error('生成预签名 URL 时发生严重错误:', error);
    return NextResponse.json({ error: `服务器内部错误: ${error.message}` }, { status: 500 });
  }
}

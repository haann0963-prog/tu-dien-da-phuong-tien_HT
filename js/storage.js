import { supabase } from './supabaseClient.js';

const BUCKET_NAME = 'media';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadImageToStorage(file, folder = 'general') {
    if (!file) return null;

    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error('Chỉ hỗ trợ định dạng ảnh JPG, PNG, WEBP hoặc GIF.');
    }

    if (file.size > MAX_SIZE_BYTES) {
        throw new Error('Dung lượng ảnh vượt quá giới hạn 5MB.');
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = `${folder}/${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        throw new Error(`Tải ảnh lên thất bại: ${uploadError.message}`);
    }

    const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    return data.publicUrl;
}
-- Thêm cột lưu đường dẫn bài báo / nguồn tham khảo cho bài viết cộng đồng
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS source_url TEXT;

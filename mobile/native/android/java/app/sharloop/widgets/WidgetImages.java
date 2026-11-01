package app.sharloop.widgets;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.Base64;

import androidx.annotation.Nullable;

// Drawing for the widgets: photos from the snapshot's data URLs, round
// avatars (photo, or initial/emoji on the person's colour) with a ring, and
// rounded-corner photos. Widgets can only show bitmaps, so all the shaping
// happens here.
final class WidgetImages {
    private WidgetImages() {}

    @Nullable
    static Bitmap decodeDataUrl(@Nullable String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:") || comma < 0) return null;
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // A round avatar `size` px wide with a `ring` px ring in `ringColor`.
    static Bitmap avatar(@Nullable String photo, @Nullable String emoji, String name, String hexColor, int size, int ring, int ringColor) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float r = size / 2f;

        paint.setColor(ringColor);
        canvas.drawCircle(r, r, r, paint);

        float inner = r - ring;
        Bitmap source = decodeDataUrl(photo);
        if (source != null) {
            Bitmap scaled = Bitmap.createScaledBitmap(source, (int) (inner * 2), (int) (inner * 2), true);
            paint.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
            canvas.save();
            canvas.translate(ring, ring);
            canvas.drawCircle(inner, inner, inner, paint);
            canvas.restore();
            paint.setShader(null);
        } else {
            int base = parseColor(hexColor);
            paint.setShader(new LinearGradient(0, 0, size, size, base, darken(base), Shader.TileMode.CLAMP));
            canvas.drawCircle(r, r, inner, paint);
            paint.setShader(null);

            String text = emoji != null && !emoji.isEmpty() ? emoji : initial(name);
            paint.setColor(Color.WHITE);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(inner * 0.95f);
            Paint.FontMetrics fm = paint.getFontMetrics();
            canvas.drawText(text, r, r - (fm.ascent + fm.descent) / 2f, paint);
        }
        return out;
    }

    // A photo cropped to fill width × height with rounded corners.
    static Bitmap roundedCover(Bitmap source, int width, int height, float radius) {
        Bitmap out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        float scale = Math.max(width / (float) source.getWidth(), height / (float) source.getHeight());
        Bitmap scaled = Bitmap.createScaledBitmap(source,
                Math.max(1, Math.round(source.getWidth() * scale)), Math.max(1, Math.round(source.getHeight() * scale)), true);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        BitmapShader shader = new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        android.graphics.Matrix m = new android.graphics.Matrix();
        m.setTranslate((width - scaled.getWidth()) / 2f, (height - scaled.getHeight()) / 2f);
        shader.setLocalMatrix(m);
        paint.setShader(shader);
        canvas.drawRoundRect(new RectF(0, 0, width, height), radius, radius, paint);
        return out;
    }

    private static String initial(String name) {
        String trimmed = name.trim();
        return trimmed.isEmpty() ? "?" : trimmed.substring(0, trimmed.offsetByCodePoints(0, 1)).toUpperCase(new java.util.Locale("tr", "TR"));
    }

    private static int parseColor(String hex) {
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return Color.parseColor("#8B5CF6");
        }
    }

    private static int darken(int color) {
        return Color.rgb((int) (Color.red(color) * 0.7f), (int) (Color.green(color) * 0.7f), (int) (Color.blue(color) * 0.7f));
    }
}

package io.github.sergesotnyk.ebody;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * The game in a full-screen WebView. Its files, the built site, are the APK's
 * assets, served at https://appassets.androidplatform.net/ebody/ the way
 * GitHub Pages serves them at /ebody/. The page only needs to know it is
 * packaged (src/platform/app.ts).
 */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://" + WebViewAssetLoader.DEFAULT_DOMAIN;
    private static final String GAME = ORIGIN + "/ebody/index.html";
    /** Esc for the page; "true" if the page used it (closed something or opened the menu). */
    private static final String ESCAPE =
            "!window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', cancelable: true}))";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/ebody/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // localStorage: the saved game and settings
        settings.setMediaPlaybackRequiresUserGesture(false); // the title music plays without a key press first
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if (path != null && path.endsWith("/")) url = url.buildUpon().path(path + "index.html").build();
                return assets.shouldInterceptRequest(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (WebViewAssetLoader.DEFAULT_DOMAIN.equals(url.getHost())) return false;
                // Links out of the game (licences, PyElectroMan) open in a browser, if there is one.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException e) {
                    // A TV often has none.
                }
                return true;
            }
        });
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
        web.loadUrl(GAME);
        web.requestFocus();
    }

    /**
     * Back (a TV remote's button, or a phone's back gesture) is the game's Esc:
     * it opens or closes the menu, and where the game has nothing to close it
     * leaves the app. A keyboard's Esc goes to the page as it is; when the page
     * leaves it unused, Android sends it once more as a "fallback" Back, which
     * is ignored here.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event);
        boolean fallback = (event.getFlags() & KeyEvent.FLAG_FALLBACK) != 0;
        if (!fallback && event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) back();
        return true;
    }

    private void back() {
        String url = web.getUrl();
        if (url != null && !url.startsWith(GAME) && web.canGoBack()) {
            web.goBack(); // from the level or sprite viewer, back to the game
            return;
        }
        web.evaluateJavascript(ESCAPE, used -> {
            if (!"true".equals(used)) finish();
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Full screen: the status and navigation bars show only for a swipe from the edge. */
    private void hideSystemBars() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.hide(WindowInsetsCompat.Type.systemBars());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    /** In the background the page is hidden: the game stops and its sound goes quiet (src/platform/audio.ts). */
    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}

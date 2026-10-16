package com.brgelectro.batiplus;

import android.view.HapticFeedbackConstants;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BâtiPlus — retour tactile léger sur les actions importantes.
 *
 * Remplace le plugin Haptics : performHapticFeedback() passe par le système et respecte le
 * réglage « Retour haptique » du téléphone, SANS la permission VIBRATE. L'application ne
 * déclare ainsi que les permissions strictement utiles (INTERNET, POST_NOTIFICATIONS,
 * ACCESS_NETWORK_STATE).
 */
@CapacitorPlugin(name = "RetourTactile")
public class RetourTactilePlugin extends Plugin {

    @PluginMethod
    public void toucher(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView vue = getBridge().getWebView();
            if (vue != null) {
                vue.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            }
            call.resolve();
        });
    }
}

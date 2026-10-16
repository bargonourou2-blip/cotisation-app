package com.brgelectro.batiplus;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* Plugin local, enregistré AVANT la création du pont Capacitor. */
        registerPlugin(RetourTactilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

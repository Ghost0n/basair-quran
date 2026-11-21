package app.qbasair.quran;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin (not a package): the account's secure store (QbAuthPlugin).
        registerPlugin(QbAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

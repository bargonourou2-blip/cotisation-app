# BâtiPlus — règles de réduction du code (minifyEnabled true en version publiée).
# Les règles de Capacitor (plugins, annotations) sont fournies par la bibliothèque
# capacitor-android (consumerProguardFiles). On garde en plus :

# Le pont JavaScript ↔ Android (méthodes appelées depuis la page).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Le plugin local de retour tactile (appelé par son nom depuis la page).
-keep class com.brgelectro.batiplus.RetourTactilePlugin { *; }

# Numéros de ligne dans les rapports de plantage de la Play Console (fichier mapping.txt).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

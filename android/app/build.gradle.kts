plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.sergesotnyk.ebody"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.sergesotnyk.ebody"
        minSdk = 24
        targetSdk = 35
        // Each CI run gets a higher number, so a newer APK installs over an older one.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toInt() ?: 1
        versionName = "1.0.$versionCode"
    }

    signingConfigs {
        // A public key, committed on purpose: it is only there so that a new
        // APK installs over the old one and keeps the saved games. Anyone can
        // sign with it, so it is no good for a store (see README).
        create("sideload") {
            storeFile = file("sideload.p12")
            storeType = "pkcs12"
            storePassword = "android"
            keyAlias = "sideload"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("sideload")
        }
    }

    sourceSets {
        getByName("main") {
            // The built site (npm run build) is the app's content; MainActivity serves it at /ebody/.
            assets.srcDir("../../dist")
            // Launcher icon and TV banner, made by npm run assets.
            res.srcDir("src/generated/res")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core:1.13.1")
}

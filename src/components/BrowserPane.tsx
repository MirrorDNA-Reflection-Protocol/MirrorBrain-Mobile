/**
 * Browser Pane — In-App WebView Browser
 * 
 * Glassmorphic browser for viewing web content without leaving the app.
 * Used for opening search result citations and general web browsing.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    SafeAreaView,
    StatusBar,
    Platform,
    Share,
    Linking,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { GlassView } from './GlassView';
import { colors, spacing } from '../theme';
import { HapticService } from '../services';

interface BrowserPaneProps {
    url: string;
    onClose: () => void;
    onNavigate?: (url: string) => void;
}

export const BrowserPane: React.FC<BrowserPaneProps> = ({
    url: initialUrl,
    onClose,
    onNavigate,
}) => {
    const webViewRef = useRef<WebView>(null);
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [inputUrl, setInputUrl] = useState(initialUrl);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [pageTitle, setPageTitle] = useState('');

    const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
        setCanGoBack(navState.canGoBack);
        setCanGoForward(navState.canGoForward);
        setCurrentUrl(navState.url);
        setInputUrl(navState.url);
        setPageTitle(navState.title || '');
        setIsLoading(navState.loading || false);

        if (onNavigate) {
            onNavigate(navState.url);
        }
    }, [onNavigate]);

    const goBack = () => {
        HapticService.tap();
        webViewRef.current?.goBack();
    };

    const goForward = () => {
        HapticService.tap();
        webViewRef.current?.goForward();
    };

    const reload = () => {
        HapticService.tap();
        webViewRef.current?.reload();
    };

    const handleUrlSubmit = () => {
        let urlToLoad = inputUrl;
        if (!urlToLoad.startsWith('http://') && !urlToLoad.startsWith('https://')) {
            // If it looks like a URL, add https
            if (urlToLoad.includes('.') && !urlToLoad.includes(' ')) {
                urlToLoad = `https://${urlToLoad}`;
            } else {
                // Otherwise, search for it
                urlToLoad = `https://duckduckgo.com/?q=${encodeURIComponent(urlToLoad)}`;
            }
        }
        setCurrentUrl(urlToLoad);
    };

    const handleShare = async () => {
        HapticService.tap();
        try {
            await Share.share({
                message: `${pageTitle}\n${currentUrl}`,
                url: currentUrl,
            });
        } catch (error) {
            console.log('Share failed:', error);
        }
    };

    const openExternally = () => {
        HapticService.tap();
        Linking.openURL(currentUrl);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <GlassView style={styles.header} variant="prominent">
                <View style={styles.headerContent}>
                    {/* Close Button */}
                    <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                        <Text style={styles.headerButtonText}>✕</Text>
                    </TouchableOpacity>

                    {/* URL Bar */}
                    <View style={styles.urlBar}>
                        {isLoading && <Text style={styles.loadingDot}>●</Text>}
                        <TextInput
                            style={styles.urlInput}
                            value={inputUrl}
                            onChangeText={setInputUrl}
                            onSubmitEditing={handleUrlSubmit}
                            placeholder="Search or enter URL"
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="go"
                            selectTextOnFocus
                        />
                    </View>

                    {/* Share/Open Button */}
                    <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
                        <Text style={styles.headerButtonText}>↗</Text>
                    </TouchableOpacity>
                </View>
            </GlassView>

            {/* WebView */}
            <WebView
                ref={webViewRef}
                source={{ uri: currentUrl }}
                style={styles.webview}
                onNavigationStateChange={handleNavigationStateChange}
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                allowsBackForwardNavigationGestures
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState
                renderLoading={() => (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Loading...</Text>
                    </View>
                )}
            />

            {/* Bottom Navigation */}
            <GlassView style={styles.bottomNav} variant="subtle">
                <View style={styles.navButtons}>
                    <TouchableOpacity
                        onPress={goBack}
                        disabled={!canGoBack}
                        style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
                    >
                        <Text style={styles.navButtonText}>‹</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={goForward}
                        disabled={!canGoForward}
                        style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
                    >
                        <Text style={styles.navButtonText}>›</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={reload} style={styles.navButton}>
                        <Text style={styles.navButtonText}>↻</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={openExternally} style={styles.navButton}>
                        <Text style={styles.navButtonText}>⬈</Text>
                    </TouchableOpacity>
                </View>
            </GlassView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        marginHorizontal: spacing.sm,
        marginTop: spacing.sm,
        marginBottom: spacing.xs,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.sm,
        gap: spacing.sm,
    },
    headerButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '500',
    },
    urlBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        paddingHorizontal: spacing.sm,
        height: 36,
    },
    loadingDot: {
        color: colors.accentPrimary,
        fontSize: 8,
        marginRight: 6,
    },
    urlInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 14,
    },
    webview: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
    },
    bottomNav: {
        marginHorizontal: spacing.sm,
        marginBottom: spacing.sm,
        marginTop: spacing.xs,
    },
    navButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: spacing.sm,
    },
    navButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    navButtonDisabled: {
        opacity: 0.3,
    },
    navButtonText: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '300',
    },
});

export default BrowserPane;

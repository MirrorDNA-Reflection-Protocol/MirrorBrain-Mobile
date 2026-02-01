package com.mirrorbrainmobile.root

import android.util.Log
import com.mirrorbrainmobile.BuildConfig
import com.topjohnwu.superuser.Shell

/**
 * RootShellManager — libsu wrapper for root commands
 *
 * Provides safe root shell access with proper error handling
 * and command execution utilities.
 */
object RootShellManager {
    private const val TAG = "RootShellManager"

    /** Check if device is rooted and we have root access */
    val isRootAvailable: Boolean
        get() = Shell.isAppGrantedRoot() == true

    /** Check if root shell is currently active */
    val isRootActive: Boolean
        get() = Shell.getShell().isRoot

    /**
     * Initialize root shell with libsu configuration
     * Call this early in app lifecycle (Application.onCreate)
     */
    fun initialize() {
        Shell.enableVerboseLogging = BuildConfig.DEBUG
        Shell.setDefaultBuilder(
            Shell.Builder.create()
                .setFlags(Shell.FLAG_REDIRECT_STDERR)
                .setTimeout(10)
        )
        Log.i(TAG, "Root shell initialized, root available: $isRootAvailable")
    }

    /**
     * Execute a root command and return the result
     */
    fun execute(command: String): RootResult {
        return try {
            val result = Shell.cmd(command).exec()
            RootResult(
                success = result.isSuccess,
                output = result.out.joinToString("\n"),
                error = result.err.joinToString("\n"),
                exitCode = result.code
            )
        } catch (e: Exception) {
            Log.e(TAG, "Root command failed: $command", e)
            RootResult(
                success = false,
                output = "",
                error = e.message ?: "Unknown error",
                exitCode = -1
            )
        }
    }

    /**
     * Execute multiple commands in sequence
     */
    fun executeMultiple(vararg commands: String): RootResult {
        return try {
            val result = Shell.cmd(*commands).exec()
            RootResult(
                success = result.isSuccess,
                output = result.out.joinToString("\n"),
                error = result.err.joinToString("\n"),
                exitCode = result.code
            )
        } catch (e: Exception) {
            Log.e(TAG, "Root commands failed", e)
            RootResult(
                success = false,
                output = "",
                error = e.message ?: "Unknown error",
                exitCode = -1
            )
        }
    }

    /**
     * Execute command asynchronously with callback
     */
    fun executeAsync(command: String, callback: (RootResult) -> Unit) {
        Shell.cmd(command).submit { result ->
            callback(
                RootResult(
                    success = result.isSuccess,
                    output = result.out.joinToString("\n"),
                    error = result.err.joinToString("\n"),
                    exitCode = result.code
                )
            )
        }
    }

    /**
     * Read a system file that requires root access
     */
    fun readFile(path: String): String? {
        val result = execute("cat $path")
        return if (result.success) result.output else null
    }

    /**
     * Write to a system file that requires root access
     */
    fun writeFile(path: String, content: String): Boolean {
        val escapedContent = content.replace("'", "'\\''")
        val result = execute("echo '$escapedContent' > $path")
        return result.success
    }

    /**
     * Check if a file exists (with root access)
     */
    fun fileExists(path: String): Boolean {
        val result = execute("test -f $path && echo 'exists'")
        return result.output.trim() == "exists"
    }

    /**
     * Get process list
     */
    fun getProcessList(): List<ProcessInfo> {
        val result = execute("ps -A -o PID,USER,NAME")
        if (!result.success) return emptyList()

        return result.output.lines()
            .drop(1) // Skip header
            .mapNotNull { line ->
                val parts = line.trim().split(Regex("\\s+"), limit = 3)
                if (parts.size >= 3) {
                    ProcessInfo(
                        pid = parts[0].toIntOrNull() ?: 0,
                        user = parts[1],
                        name = parts[2]
                    )
                } else null
            }
    }

    /**
     * Kill a process by PID (requires root)
     */
    fun killProcess(pid: Int): Boolean {
        val result = execute("kill -9 $pid")
        return result.success
    }

    /**
     * Set system property (requires root)
     */
    fun setSystemProperty(key: String, value: String): Boolean {
        val result = execute("setprop $key $value")
        return result.success
    }

    /**
     * Get system property
     */
    fun getSystemProperty(key: String): String? {
        val result = execute("getprop $key")
        return if (result.success) result.output.trim() else null
    }
}

/**
 * Result of a root command execution
 */
data class RootResult(
    val success: Boolean,
    val output: String,
    val error: String,
    val exitCode: Int
)

/**
 * Process information
 */
data class ProcessInfo(
    val pid: Int,
    val user: String,
    val name: String
)

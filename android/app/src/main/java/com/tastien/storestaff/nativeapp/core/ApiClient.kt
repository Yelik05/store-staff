package com.tastien.storestaff.nativeapp.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 统一网络层：
 * - 所有接口 POST api.php?action=xxx，请求体 JSON
 * - 自动附加 X-App-Token
 * - 统一解析 {ok,data|error,code}
 * - Token 失效抛出 SessionExpiredException 并清本地会话
 * - 连接/读超时 10s/20s，IO 异常自动重试 1 次
 */
object ApiClient {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun post(action: String, payload: JsonObject = JsonObject(emptyMap())): JsonObject =
        withContext(Dispatchers.IO) {
            var lastError: IOException? = null
            repeat(2) { attempt ->
                try {
                    return@withContext execute(action, payload.toString().toRequestBody(jsonMedia))
                } catch (e: IOException) {
                    lastError = e
                    if (attempt == 1) {
                        throw ApiException("NETWORK_ERROR", "网络连接失败，请检查网络后重试")
                    }
                }
            }
            throw ApiException("NETWORK_ERROR", "网络连接失败，请检查网络后重试")
        }

    /** 附件上传：multipart 请求（file.upload 等），错误解析与 JSON 接口保持一致。 */
    suspend fun postMultipart(action: String, body: RequestBody): JsonObject =
        withContext(Dispatchers.IO) {
            try {
                execute(action, body)
            } catch (e: IOException) {
                throw ApiException("NETWORK_ERROR", "网络连接失败，请检查网络后重试")
            }
        }

    private fun execute(action: String, body: RequestBody): JsonObject {
        val requestBuilder = Request.Builder()
            .url(AppConfig.BASE_URL + "api.php?action=" + action)
            .post(body)
            .header("Accept", "application/json")
            .header("X-App-Client", AppConfig.CLIENT_TAG)

        SessionStore.token?.takeIf { it.isNotBlank() }
            ?.let { requestBuilder.header("X-App-Token", it) }

        client.newCall(requestBuilder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val root = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrElse {
                if (response.code == 404) {
                    throw ApiException("ROUTE_MISSING", "线上版本暂未开放该功能，请更新服务端后再试", 404)
                }
                throw ApiException("SERVER_ERROR", "服务器返回格式异常，请稍后重试", response.code)
            }
            val ok = root["ok"]?.jsonPrimitive?.booleanOrNull == true
            if (!ok) {
                val code = root["code"]?.jsonPrimitive?.contentOrNull ?: "ERROR"
                val message = root["error"]?.jsonPrimitive?.contentOrNull ?: "请求失败，请稍后重试"
                if (response.code == 401 ||
                    code == "TOKEN_INVALID" ||
                    code == "TOKEN_EXPIRED" ||
                    code == "TOKEN_REVOKED" ||
                    code == "UNAUTHORIZED"
                ) {
                    SessionStore.clear()
                    throw SessionExpiredException(code, message)
                }
                throw ApiException(code, message, response.code)
            }
            val data = root["data"] ?: return JsonObject(emptyMap())
            /* 兼容部分接口 data 直接为数组（如 salary.myMonths / settings.dimensions） */
            return data as? JsonObject ?: JsonObject(mapOf("list" to data))
        }
    }
}

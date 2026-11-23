package com.tastien.storestaff.nativeapp.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.strings
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/** 员工端报销申请（字段对齐后端 claim 输出）。 */
data class ReimburseClaim(
    val id: String = "",
    val staffName: String = "",
    val categoryId: String = "",
    val categoryName: String = "",
    val amount: Double = 0.0,
    val reason: String = "",
    val attachments: List<String> = emptyList(),
    val payeeType: String = "",
    val payeeAccount: String = "",
    val payeeBank: String = "",
    val payeeHolder: String = "",
    val status: String = "",
    val reviewedBy: String = "",
    val reviewedAt: String = "",
    val rejectReason: String = "",
    val paidAt: String = "",
    val createdAt: String = ""
)

data class ReimburseCategory(
    val id: String = "",
    val name: String = ""
)

data class ReimbursePayee(
    val id: String = "",
    val type: String = "",
    val account: String = "",
    val bankName: String = "",
    val holderName: String = "",
    val isDefault: Boolean = false
)

/** 已上传附件：key 用于提交表单，name 仅用于回显文件名。 */
data class ReimburseAttachment(
    val key: String = "",
    val name: String = ""
)

object ReimburseRepository {

    private const val MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
    private val ALLOWED_MIME = setOf(
        "image/jpeg", "image/png", "image/webp", "application/pdf"
    )

    /** status 为空表示全部；服务端一次最多返回 200 条，分页由客户端完成。 */
    suspend fun my(status: String? = null): List<ReimburseClaim> {
        val data = ApiClient.post(
            "reimburse.my",
            buildJsonObject { if (!status.isNullOrBlank()) put("status", status) }
        )
        return data.array("list")?.objects()?.map(::parseClaim) ?: emptyList()
    }

    suspend fun categories(): List<ReimburseCategory> {
        val data = ApiClient.post("reimburse.categories")
        return data.array("list")?.objects()?.map {
            ReimburseCategory(
                id = it.text("id"),
                name = it.text("name")
            )
        } ?: emptyList()
    }

    suspend fun payees(): List<ReimbursePayee> {
        val data = ApiClient.post("reimburse.payees")
        return data.array("list")?.objects()?.map {
            ReimbursePayee(
                id = it.text("id"),
                type = it.text("type"),
                account = it.text("account"),
                bankName = it.text("bankName"),
                holderName = it.text("holderName"),
                isDefault = it.bool("isDefault")
            )
        } ?: emptyList()
    }

    suspend fun create(
        categoryId: String,
        amount: Double,
        reason: String,
        attachments: List<String>,
        payeeId: String?,
        type: String,
        account: String,
        bankName: String,
        holderName: String,
        payeeDefault: Boolean? = null
    ) {
        val payload = buildJsonObject {
            put("categoryId", categoryId)
            put("amount", amount)
            put("reason", reason)
            putJsonArray("attachments") { attachments.forEach { add(it) } }
            if (!payeeId.isNullOrBlank()) put("payeeId", payeeId)
            put("type", type)
            put("account", account)
            put("bankName", bankName)
            put("holderName", holderName)
            if (payeeDefault != null) put("payeeDefault", payeeDefault)
        }
        ApiClient.post("reimburse.create", payload)
    }

    /** 上传报销附件：form 字段 type=reimburse，文件字段名 file。 */
    suspend fun uploadAttachment(context: Context, uri: Uri): ReimburseAttachment {
        val resolver = context.contentResolver
        val name = queryName(context, uri)?.takeIf { it.isNotBlank() }
            ?: "receipt_${System.currentTimeMillis()}"
        val mime = (resolver.getType(uri) ?: guessMime(name)).lowercase()
        if (mime !in ALLOWED_MIME) {
            throw ApiException("FILE_TYPE_UNSUPPORTED", "仅支持 JPG / PNG / WEBP / PDF 附件")
        }
        val bytes = withContext(Dispatchers.IO) {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        } ?: throw ApiException("UPLOAD_FAIL", "无法读取所选文件，请重新选择")
        if (bytes.size > MAX_ATTACHMENT_BYTES) {
            throw ApiException("FILE_TOO_LARGE", "单个附件不能超过 10MB")
        }

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("type", "reimburse")
            .addFormDataPart("file", name, bytes.toRequestBody(mime.toMediaTypeOrNull()))
            .build()

        val data = ApiClient.postMultipart("file.upload", body)
        val key = data.text("key")
        if (key.isBlank()) throw ApiException("UPLOAD_FAIL", "附件上传失败，请重试")
        return ReimburseAttachment(
            key = key,
            name = data.text("name").ifBlank { name }
        )
    }

    private fun parseClaim(r: JsonObject): ReimburseClaim = ReimburseClaim(
        id = r.text("id"),
        staffName = r.text("staffName"),
        categoryId = r.text("categoryId"),
        categoryName = r.text("categoryName"),
        amount = r["amount"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
        reason = r.text("reason"),
        attachments = r.strings("attachments"),
        payeeType = r.text("payeeType"),
        payeeAccount = r.text("payeeAccount"),
        payeeBank = r.text("payeeBank"),
        payeeHolder = r.text("payeeHolder"),
        status = r.text("status"),
        reviewedBy = r.text("reviewedBy"),
        reviewedAt = r.text("reviewedAt"),
        rejectReason = r.text("rejectReason"),
        paidAt = r.text("paidAt"),
        createdAt = r.text("createdAt")
    )

    private fun queryName(context: Context, uri: Uri): String? = runCatching {
        context.contentResolver
            .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index >= 0) cursor.getString(index) else null
                } else null
            }
    }.getOrNull()

    private fun guessMime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "pdf" -> "application/pdf"
        else -> "application/octet-stream"
    }
}

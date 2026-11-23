package com.tastien.storestaff.nativeapp.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/** 附件上传：把相册选中的 Uri 传到线上 file.upload，返回服务端 key。 */
object UploadRepository {

    suspend fun uploadImage(context: Context, uri: Uri): String {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "image/jpeg"
        val name = queryName(context, uri) ?: "task_${System.currentTimeMillis()}.jpg"
        val bytes = withContext(Dispatchers.IO) {
            resolver.openInputStream(uri)?.use { it.readBytes() }
        } ?: throw ApiException("UPLOAD_FAIL", "无法读取所选图片，请重新选择")

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("type", "task")
            .addFormDataPart("file", name, bytes.toRequestBody(mime.toMediaTypeOrNull()))
            .build()

        val data = ApiClient.postMultipart("file.upload", body)
        val key = data.text("key")
        if (key.isBlank()) throw ApiException("UPLOAD_FAIL", "图片上传失败，请重试")
        return key
    }

    private fun queryName(context: Context, uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (index >= 0) cursor.getString(index) else null
                    } else null
                }
        }.getOrNull()
    }
}

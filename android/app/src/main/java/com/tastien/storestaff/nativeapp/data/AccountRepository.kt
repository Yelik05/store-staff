package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object AccountRepository {

    /** 本人修改密码；规则与服务端一致：6—20 位且包含字母和数字。 */
    suspend fun changePassword(oldPassword: String, newPassword: String, confirmPassword: String) {
        ApiClient.post(
            "accounts.changePassword",
            buildJsonObject {
                put("oldPassword", oldPassword)
                put("newPassword", newPassword)
                put("confirmPassword", confirmPassword)
            }
        )
    }
}

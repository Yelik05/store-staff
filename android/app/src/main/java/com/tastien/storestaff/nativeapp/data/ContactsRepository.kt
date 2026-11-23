package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class ContactStaff(
    val id: String = "",
    val name: String = "",
    val nickname: String = "",
    val position: String = "",
    val phone: String = "",
    val empNo: String = "",
    val feishuEmpNo: String = "",
    val employmentType: String = ""
)

data class ContactsData(
    val list: List<ContactStaff> = emptyList(),
    val storeName: String = ""
)

object ContactsRepository {

    /** 门店通讯录：接口一次返回全部员工，无分页。 */
    suspend fun contacts(): ContactsData {
        val data = ApiClient.post("staff.contacts")
        return ContactsData(
            list = data.array("list")?.objects()?.map {
                ContactStaff(
                    id = it.text("id"),
                    name = it.text("name"),
                    nickname = it.text("nickname"),
                    position = it.text("position"),
                    phone = it.text("phone"),
                    empNo = it.text("empNo"),
                    feishuEmpNo = it.text("feishuEmpNo"),
                    employmentType = it.text("employmentType")
                )
            } ?: emptyList(),
            storeName = data.obj("store")?.text("name") ?: ""
        )
    }

    suspend fun sendPrivate(toStaffId: String, body: String) {
        ApiClient.post(
            "message.send",
            buildJsonObject {
                put("toStaffId", toStaffId)
                put("body", body)
            }
        )
    }
}

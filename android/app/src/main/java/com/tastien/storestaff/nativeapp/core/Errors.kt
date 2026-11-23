package com.tastien.storestaff.nativeapp.core

/** 业务错误：message 可直接展示给用户；code 用于分支判断。 */
class ApiException(
    val code: String,
    message: String,
    val httpStatus: Int = 0
) : Exception(message)

/** Token 失效：需要清本地会话并回到登录页。 */
class SessionExpiredException(
    val code: String,
    message: String
) : Exception(message)

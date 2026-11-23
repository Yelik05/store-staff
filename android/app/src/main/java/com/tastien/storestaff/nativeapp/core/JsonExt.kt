package com.tastien.storestaff.nativeapp.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/* 后端字段读取的容错封装：缺失或类型不符时返回安全默认值。 */

fun JsonObject.text(key: String): String =
    this[key]?.jsonPrimitive?.contentOrNull ?: ""

fun JsonObject.int(key: String): Int =
    this[key]?.jsonPrimitive?.intOrNull ?: 0

fun JsonObject.bool(key: String): Boolean =
    this[key]?.jsonPrimitive?.booleanOrNull ?: false

fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject

fun JsonObject.array(key: String): JsonArray? = this[key] as? JsonArray

fun JsonObject.strings(key: String): List<String> = array(key)?.mapNotNull { el ->
    when (el) {
        is JsonPrimitive -> el.contentOrNull
        is JsonObject -> el.text("key").ifBlank { el.text("url") }
        else -> null
    }
} ?: emptyList()

fun JsonArray.objects(): List<JsonObject> = mapNotNull { it as? JsonObject }

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'action', 'description'])]
class ActivityLog extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function record(?User $actor, string $action, string $description): void
    {
        static::create(['user_id' => $actor?->id, 'action' => $action, 'description' => $description]);
    }
}

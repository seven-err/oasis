<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    protected function signIn(User $user): static
    {
        $user->refresh();

        return $this->actingAs($user)->withSession(['auth_version' => $user->auth_version]);
    }
}
